#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import logging, os, re
import time
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters
from telegram.request import HTTPXRequest
from telegram.error import TimedOut, RetryAfter, NetworkError

# Importações do Firebase
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from config import (
    BOT_TOKEN, ADMIN_ID, 
    FIREBASE_PROJECT_ID, FIREBASE_TYPE, FIREBASE_PRIVATE_KEY_ID, FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL, FIREBASE_CLIENT_ID, FIREBASE_AUTH_URI, FIREBASE_TOKEN_URI,
    FIREBASE_AUTH_PROVIDER_X509_CERT_URL, FIREBASE_CLIENT_X509_CERT_URL, FIREBASE_UNIVERSE_DOMAIN,
    COLLECTION_USUARIOS, COLLECTION_GASTOS, COLLECTION_PAGAMENTOS, COLLECTION_CONFIGURACOES
)

# --- Configuração segura de logging ---
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
# Reduz verbosidade de libs que imprimem URLs (com token)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("telegram.request").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


# Padrões que podem vazar token
# 1) URL do Telegram com prefixo 'bot'
_token_in_url = re.compile(r"bot\d{6,}:[A-Za-z0-9_-]{30,}")
# 2) Token “cru” (sem o 'bot' antes) — útil se alguém logar só o valor do token
_token_raw = re.compile(r"\d{6,}:[A-Za-z0-9_-]{30,}")

class RedactTokenFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()

        # Mascara o token exato, se disponível
        if BOT_TOKEN:
            msg = msg.replace(BOT_TOKEN, "<TOKEN>")
            msg = msg.replace(f"bot{BOT_TOKEN}", "bot<TOKEN>")

        # Fallback: mascara qualquer coisa que pareça token
        msg = _token_in_url.sub("bot<REDACTED>", msg)
        msg = _token_raw.sub("<REDACTED>", msg)

        record.msg = msg
        record.args = ()
        return True

# ✅ Aplique o filtro no root logger (pega tudo, inclusive futuros handlers)
root_logger = logging.getLogger()
root_logger.addFilter(RedactTokenFilter())

# logger da aplicação
logger = logging.getLogger(__name__)

request = HTTPXRequest(
    connect_timeout=15.0,   # conexão com API TG
    read_timeout=60.0,      # tempo para receber resposta
    write_timeout=60.0,
    pool_timeout=15.0,
)

# Estados para o modo de escuta
ESTADO_NORMAL = "normal"
ESTADO_AGUARDANDO_GASTO = "aguardando_gasto"
ESTADO_AGUARDANDO_PAGAMENTO = "aguardando_pagamento"
ESTADO_AGUARDANDO_CONSULTA_USUARIO = "aguardando_consulta_usuario"
ESTADO_AGUARDANDO_EXTRATO_ADMIN = 91  # número alto para não colidir

application = None

class FirebaseCartaoCreditoBot:
    """Classe principal para gerenciar a lógica de negócios do bot de cartão de crédito."""
    def __init__(self):
        self.db = self._inicializar_firebase()
        self._inicializar_configuracoes()
        self.fatura_manager = Fatura()
    
    def _inicializar_firebase(self):
        """Inicializa a conexão com o Firebase"""
        try:
            # Verificar se o Firebase já foi inicializado
            firebase_admin.get_app()
            logger.info("Firebase já inicializado")
        except ValueError:
            # Firebase não foi inicializado ainda
            if (FIREBASE_TYPE and FIREBASE_PROJECT_ID and FIREBASE_PRIVATE_KEY_ID and
                FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL and FIREBASE_CLIENT_ID and
                FIREBASE_AUTH_URI and FIREBASE_TOKEN_URI and FIREBASE_AUTH_PROVIDER_X509_CERT_URL and
                FIREBASE_CLIENT_X509_CERT_URL and FIREBASE_UNIVERSE_DOMAIN):
                
                # Construir o dicionário de credenciais a partir das variáveis de ambiente
                cred_dict = {
                    "type": FIREBASE_TYPE,
                    "project_id": FIREBASE_PROJECT_ID,
                    "private_key_id": FIREBASE_PRIVATE_KEY_ID,
                    "private_key": FIREBASE_PRIVATE_KEY.replace("\\n", "\n"), # Substituir \n por quebra de linha real
                    "client_email": FIREBASE_CLIENT_EMAIL,
                    "client_id": FIREBASE_CLIENT_ID,
                    "auth_uri": FIREBASE_AUTH_URI,
                    "token_uri": FIREBASE_TOKEN_URI,
                    "auth_provider_x509_cert_url": FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
                    "client_x509_cert_url": FIREBASE_CLIENT_X509_CERT_URL,
                    "universe_domain": FIREBASE_UNIVERSE_DOMAIN
                }
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred, {
                    'projectId': FIREBASE_PROJECT_ID,
                })
            else:
                # Fallback para credenciais padrão do ambiente (para desenvolvimento local sem todas as VAs)
                logger.warning("Variáveis de ambiente do Firebase incompletas. Tentando credenciais padrão.")
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred, {
                    'projectId': FIREBASE_PROJECT_ID,
                })
            
            logger.info("Firebase inicializado com sucesso")
        
        return firestore.client()
    
    def _inicializar_configuracoes(self):
        """Inicializa configurações padrão no Firestore se não existirem"""
        config_ref = self.db.collection(COLLECTION_CONFIGURACOES).document('global')
        config_doc = config_ref.get()
        
        if not config_doc.exists:
            configuracoes_iniciais = {
                "dia_vencimento": 10,
                "mes_atual": datetime.now().month,
                "ano_atual": datetime.now().year,
                "criado_em": firestore.SERVER_TIMESTAMP,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            config_ref.set(configuracoes_iniciais)
            logger.info("Configurações iniciais criadas no Firestore")
    
    def _decimal_para_float(self, obj):
        """Converte Decimal para float para armazenamento no Firestore"""
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: self._decimal_para_float(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._decimal_para_float(item) for item in obj]
        return obj
    
    def _float_para_decimal(self, obj):
        """Converte float para Decimal após leitura do Firestore"""
        if isinstance(obj, (int, float)) and not isinstance(obj, bool):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {k: self._float_para_decimal(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._float_para_decimal(item) for item in obj]
        return obj
    
    def registrar_usuario(self, user_id, user_name, username=None):
        """Registra informações do usuário no Firestore"""
        try:
            user_ref = self.db.collection(COLLECTION_USUARIOS).document(str(user_id))
            user_data = {
                "name": user_name,
                "username": username,
                "last_seen": firestore.SERVER_TIMESTAMP,
                "ativo": True,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            
            # Verificar se o usuário já existe
            user_doc = user_ref.get()
            if user_doc.exists:
                # Atualizar apenas campos específicos
                user_ref.update({
                    "name": user_name,
                    "username": username,
                    "last_seen": firestore.SERVER_TIMESTAMP,
                    "atualizado_em": firestore.SERVER_TIMESTAMP
                })
            else:
                # Criar novo usuário
                user_data["criado_em"] = firestore.SERVER_TIMESTAMP
                user_ref.set(user_data)
            
            logger.info(f"Usuário {user_id} registrado/atualizado no Firestore")
        except Exception as e:
            logger.error(f"Erro ao registrar usuário {user_id}: {e}")
    
    def adicionar_gasto(self, user_id, descricao, valor_total, parcelas=1):
        """Adiciona um novo gasto no Firestore"""
        try:
            gasto_id = f"{user_id}_{int(time.time())}"
            valor_total = Decimal(str(valor_total))
            valor_parcela = valor_total / parcelas
            
            gasto_data = {
                "id": gasto_id,
                "user_id": str(user_id),
                "descricao": descricao,
                "valor_total": float(valor_total),
                "valor_parcela": float(valor_parcela),
                "parcelas_total": parcelas,
                "parcelas_pagas": 0,
                "data_compra": datetime.now(),
                "ativo": True,
                "mes_inicio": datetime.now().month,
                "ano_inicio": datetime.now().year,
                "criado_em": firestore.SERVER_TIMESTAMP,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            
            # Adicionar ao Firestore
            gasto_ref = self.db.collection(COLLECTION_GASTOS).document(gasto_id)
            gasto_ref.set(gasto_data)
            
            logger.info(f"Gasto {gasto_id} adicionado ao Firestore")
            return gasto_id
        except Exception as e:
            logger.error(f"Erro ao adicionar gasto: {e}")
            raise
    
    def adicionar_pagamento(self, user_id, valor, descricao=""):
        """Adiciona um pagamento no Firestore"""
        try:
            pagamento_id = f"pag_{user_id}_{int(time.time())}"
            valor = Decimal(str(valor))
            
            pagamento_data = {
                "id": pagamento_id,
                "user_id": str(user_id),
                "valor": float(valor),
                "descricao": descricao,
                "data_pagamento": datetime.now(),
                "mes": datetime.now().month,
                "ano": datetime.now().year,
                "criado_em": firestore.SERVER_TIMESTAMP,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            
            # Adicionar ao Firestore
            pagamento_ref = self.db.collection(COLLECTION_PAGAMENTOS).document(pagamento_id)
            pagamento_ref.set(pagamento_data)
            
            logger.info(f"Pagamento {pagamento_id} adicionado ao Firestore")
            return pagamento_id
        except Exception as e:
            logger.error(f"Erro ao adicionar pagamento: {e}")
            raise
    
    def calcular_fatura_usuario(self, user_id, mes=None, ano=None):
        """Calcula o valor da fatura de um usuário para um mês específico"""
        if mes is None:
            mes = datetime.now().month
        if ano is None:
            ano = datetime.now().year
        
        user_id_str = str(user_id)
        total_fatura = Decimal('0')
        gastos_mes = []
        
        try:
            # Buscar gastos do usuário no Firestore
            gastos_query = self.db.collection(COLLECTION_GASTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            ).where(
                filter=FieldFilter("ativo", "==", True)
            )
            
            gastos_docs = gastos_query.stream()
            
            for doc in gastos_docs:
                gasto = doc.to_dict()
                gasto = self._float_para_decimal(gasto)
                
                # Verificar se o gasto tem parcela no mês solicitado
                if self._gasto_tem_parcela_no_mes(gasto, mes, ano):
                    total_fatura += gasto["valor_parcela"]
                    gastos_mes.append(gasto)
            
            return total_fatura, gastos_mes
        except Exception as e:
            logger.error(f"Erro ao calcular fatura do usuário {user_id}: {e}")
            return Decimal('0'), []
    
    def _gasto_tem_parcela_no_mes(self, gasto, mes, ano):
        """Verifica se um gasto tem parcela a ser paga no mês especificado"""
        mes_inicio = gasto["mes_inicio"]
        ano_inicio = gasto["ano_inicio"]
        parcelas_pagas = gasto["parcelas_pagas"]
        parcelas_total = gasto["parcelas_total"]
        
        # Calcular quantos meses se passaram desde o início
        meses_passados = (ano - ano_inicio) * 12 + (mes - mes_inicio)
        
        # Verificar se ainda há parcelas a pagar e se é o mês correto
        return (meses_passados >= 0 and 
                meses_passados < parcelas_total and 
                meses_passados >= parcelas_pagas)
    
    def calcular_saldo_usuario(self, user_id):
        """Calcula o saldo atual do usuário (gastos - pagamentos)"""
        user_id_str = str(user_id)
        
        try:
            # Calcular total de gastos até agora
            total_gastos = Decimal('0')
            mes_atual = datetime.now().month
            ano_atual = datetime.now().year
            
            # Buscar gastos do usuário
            gastos_query = self.db.collection(COLLECTION_GASTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            ).where(
                filter=FieldFilter("ativo", "==", True)
            )
            
            gastos_docs = gastos_query.stream()
            
            for doc in gastos_docs:
                gasto = doc.to_dict()
                gasto = self._float_para_decimal(gasto)
                
                # Somar todas as parcelas que já venceram
                parcelas_vencidas = self._calcular_parcelas_vencidas(gasto, mes_atual, ano_atual)
                total_gastos += gasto["valor_parcela"] * parcelas_vencidas
            
            # Calcular total de pagamentos
            total_pagamentos = Decimal('0')
            pagamentos_query = self.db.collection(COLLECTION_PAGAMENTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            )
            
            pagamentos_docs = pagamentos_query.stream()
            
            for doc in pagamentos_docs:
                pagamento = doc.to_dict()
                pagamento = self._float_para_decimal(pagamento)
                total_pagamentos += pagamento["valor"]
            
            return total_gastos - total_pagamentos
        except Exception as e:
            logger.error(f"Erro ao calcular saldo do usuário {user_id}: {e}")
            return Decimal('0')
    
    def _calcular_parcelas_vencidas(self, gasto, mes_atual, ano_atual):
        """Calcula quantas parcelas de um gasto já venceram"""
        mes_inicio = gasto["mes_inicio"]
        ano_inicio = gasto["ano_inicio"]
        parcelas_total = gasto["parcelas_total"]
        
        # Calcular quantos meses se passaram desde o início
        meses_passados = (ano_atual - ano_inicio) * 12 + (mes_atual - mes_inicio) + 1
        
        # Retornar o menor entre meses passados e total de parcelas
        return min(max(0, meses_passados), parcelas_total)
    
    def obter_gastos_usuario(self, user_id):
        """Obtém todos os gastos de um usuário do Firestore"""
        user_id_str = str(user_id)
        gastos_usuario = []
        
        try:
            gastos_query = self.db.collection(COLLECTION_GASTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            ).where(
                filter=FieldFilter("ativo", "==", True)
            ).order_by("data_compra", direction=firestore.Query.DESCENDING)
            
            gastos_docs = gastos_query.stream()
            
            for doc in gastos_docs:
                gasto = doc.to_dict()
                gasto = self._float_para_decimal(gasto)
                # Converter datetime para string ISO se necessário
                if isinstance(gasto.get("data_compra"), datetime):
                    gasto["data_compra"] = gasto["data_compra"].isoformat()
                gastos_usuario.append(gasto)
            
            return gastos_usuario
        except Exception as e:
            logger.error(f"Erro ao obter gastos do usuário {user_id}: {e}")
            return []
    
    def obter_pagamentos_usuario(self, user_id):
        """Obtém todos os pagamentos de um usuário do Firestore"""
        user_id_str = str(user_id)
        pagamentos_usuario = []
        
        try:
            pagamentos_query = self.db.collection(COLLECTION_PAGAMENTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            ).order_by("data_pagamento", direction=firestore.Query.DESCENDING)
            
            pagamentos_docs = pagamentos_query.stream()
            
            for doc in pagamentos_docs:
                pagamento = doc.to_dict()
                pagamento = self._float_para_decimal(pagamento)
                # Converter datetime para string ISO se necessário
                if isinstance(pagamento.get("data_pagamento"), datetime):
                    pagamento["data_pagamento"] = pagamento["data_pagamento"].isoformat()
                pagamentos_usuario.append(pagamento)
            
            return pagamentos_usuario
        except Exception as e:
            logger.error(f"Erro ao obter pagamentos do usuário {user_id}: {e}")
            return []
    
    def obter_info_usuario(self, user_id):
        """Obtém informações de um usuário do Firestore"""
        try:
            user_ref = self.db.collection(COLLECTION_USUARIOS).document(str(user_id))
            user_doc = user_ref.get()
            
            if user_doc.exists:
                return user_doc.to_dict()
            return None
        except Exception as e:
            logger.error(f"Erro ao obter info do usuário {user_id}: {e}")
            return None
    
    def listar_todos_usuarios(self):
        """Lista todos os usuários ativos do Firestore (apenas para admin)"""
        usuarios = []
        
        try:
            usuarios_query = self.db.collection(COLLECTION_USUARIOS).where(
                filter=FieldFilter("ativo", "==", True)
            )
            
            usuarios_docs = usuarios_query.stream()
            
            for doc in usuarios_docs:
                user_data = doc.to_dict()
                user_id = doc.id
                
                usuarios.append({
                    "id": user_id,
                    "name": user_data.get("name", ""),
                    "username": user_data.get("username"),
                    "saldo": self.calcular_saldo_usuario(int(user_id))
                })
            
            return usuarios
        except Exception as e:
            logger.error(f"Erro ao listar usuários: {e}")
            return []
    
    def obter_relatorio_completo(self):
        """Obtém relatório completo para administrador"""
        relatorio = {
            "usuarios": self.listar_todos_usuarios(),
            "total_gastos": Decimal('0'),
            "total_pagamentos": Decimal('0'),
            "saldo_geral": Decimal('0')
        }
        
        try:
            # Calcular totais de gastos
            gastos_query = self.db.collection(COLLECTION_GASTOS).where(
                filter=FieldFilter("ativo", "==", True)
            )
            gastos_docs = gastos_query.stream()
            
            for doc in gastos_docs:
                gasto = doc.to_dict()
                gasto = self._float_para_decimal(gasto)
                
                parcelas_vencidas = self._calcular_parcelas_vencidas(
                    gasto, datetime.now().month, datetime.now().year
                )
                relatorio["total_gastos"] += gasto["valor_parcela"] * parcelas_vencidas
            
            # Calcular totais de pagamentos
            pagamentos_query = self.db.collection(COLLECTION_PAGAMENTOS)
            pagamentos_docs = pagamentos_query.stream()
            
            for doc in pagamentos_docs:
                pagamento = doc.to_dict()
                pagamento = self._float_para_decimal(pagamento)
                relatorio["total_pagamentos"] += pagamento["valor"]
            
            relatorio["saldo_geral"] = relatorio["total_gastos"] - relatorio["total_pagamentos"]
            
            return relatorio
        except Exception as e:
            logger.error(f"Erro ao obter relatório completo: {e}")
            return relatorio
        
     # ===================== EXTRATO (DATA LAYER) =====================       
    def _iterar_parcelas_do_mes(self, gasto: dict, mes: int, ano: int):
        """
        Gera 0..1 itens de parcela para ESTE (mes,ano) com campos prontos para o extrato.
        Um gasto só gera uma parcela por mês, se devida.
        """
        if self._gasto_tem_parcela_no_mes(gasto, mes, ano):
            yield {
                "tipo": "Parcela",
                "descricao": gasto.get("descricao", "").strip() or "(sem descrição)",
                "valor": self._float_para_decimal(gasto.get("valor_parcela", 0.0)),
                "data": datetime(int(ano), int(mes), 1),  # data simbólica: 1º do mês
                "meta": {
                    "gasto_id": gasto.get("id") or gasto.get("doc_id"),
                    "parcelas_total": gasto.get("parcelas_total"),
                    "mes_inicio": gasto.get("mes_inicio"),
                    "ano_inicio": gasto.get("ano_inicio"),
                }
            }
    
    def obter_extrato_usuario(self, user_id, mes: int, ano: int):
        """
        Retorna (itens, totais) onde:
        - itens: lista de dicts {tipo, descricao, valor(Decimal), data(datetime), meta}
        - totais: dict {"parcelas_mes": Decimal, "pagamentos_mes": Decimal, "saldo_mes": Decimal}
        Considera:
        - Todas as parcelas de gastos devidas em (mes, ano)
        - Todos os pagamentos registrados com (mes, ano)
        """

        """
        user_id pode vir como int ou str; aqui normalizamos para str
        """
        from decimal import Decimal
        user_id_str = str(user_id)   # <<< normalização importante
        itens = []

        # --- GASTOS (parcelas do mês) ---
        gastos_ref = self.db.collection(COLLECTION_GASTOS)\
            .where("user_id", "==", user_id_str)\
            .where("ativo", "==", True)
        for doc in gastos_ref.stream():
            g = doc.to_dict() or {}
            g["doc_id"] = doc.id
            for item in self._iterar_parcelas_do_mes(g, mes, ano):
                itens.append(item)

        # --- PAGAMENTOS do mês ---
        pagamentos_ref = self.db.collection(COLLECTION_PAGAMENTOS)\
            .where("user_id", "==", user_id_str)\
            .where("mes", "==", int(mes))\
            .where("ano", "==", int(ano))
        for doc in pagamentos_ref.stream():
            p = doc.to_dict() or {}
            valor = self._float_para_decimal(p.get("valor", 0.0))
            data_pg = p.get("data_pagamento")
            # data_pagamento pode ser timestamp; reforce para datetime
            if hasattr(data_pg, "to_datetime"):
                data_pg = data_pg.to_datetime()
            elif isinstance(data_pg, (int, float)):
                data_pg = datetime.fromtimestamp(data_pg)
            elif not isinstance(data_pg, datetime):
                data_pg = datetime(int(ano), int(mes), 1)

            itens.append({
                "tipo": "Pagamento",
                "descricao": (p.get("descricao") or "Pagamento").strip(),
                "valor": valor,
                "data": data_pg,
                "meta": {"pagamento_id": doc.id}
            })

        # Ordena por data (Parcela fatura vem com dia 1; pagamentos entram na data real)
        itens.sort(key=lambda x: x["data"])

        total_parcelas = sum((i["valor"] for i in itens if i["tipo"] == "Parcela"), Decimal("0.00"))
        total_pagamentos = sum((i["valor"] for i in itens if i["tipo"] == "Pagamento"), Decimal("0.00"))
        saldo_mes = (total_parcelas - total_pagamentos).quantize(Decimal("0.01"))

        return itens, {
            "parcelas_mes": total_parcelas.quantize(Decimal("0.01")),
            "pagamentos_mes": total_pagamentos.quantize(Decimal("0.01")),
            "saldo_mes": saldo_mes
        }
    
    def buscar_usuario_por_nome_ou_username(self, termo: str):
        """
        Procura um usuário por username (com ou sem @) ou por 'name' contendo termo (case-insensitive).
        Retorna dict do usuário ou None.
        """
        termo = (termo or "").strip()
        if termo.startswith("@"):
            termo = termo[1:]

        # 1) Tenta username exato
        q1 = self.db.collection(COLLECTION_USUARIOS).where("username", "==", termo).limit(1).stream()
        for d in q1:
            u = d.to_dict() or {}
            u["user_id"] = d.id
            return u

        # 2) Tenta nome contendo termo (ingênuo; Firestore não tem contains nativo, então guardamos variantes)
        # fallback: buscar todos e filtrar em memória (se sua base for pequena)
        try:
            todos = list(self.db.collection(COLLECTION_USUARIOS).stream())
            termo_low = termo.lower()
            for d in todos:
                u = d.to_dict() or {}
                nome = (u.get("name") or "").lower()
                if termo_low in nome:
                    u["user_id"] = d.id
                    return u
        except Exception:
            pass

        return None
    
    def obter_extrato_consumo_usuario(self, user_id, mes:int, ano:int, fechamento_dia:int=9):
        """
        Extrato de uma FATURA FECHADA (consumo de 10/mes-1 a 09/mes).
        Emite PARCELAS (n/N) que caem nessa fatura; à vista => n=1/N=1
        Também inclui pagamentos dentro do mesmo período.
        """
        user_id_str = str(user_id)
        from decimal import Decimal
        inicio, fim = self.fatura_manager.get_periodo_fatura_fechada(mes, ano, fechamento_dia)


        itens = []

        # --- VARRE compras e transforma em "Parcela" se o mês consultado tem parcela ---
        gastos_ref = (
            self.db.collection(COLLECTION_GASTOS)
            .where("user_id", "==", user_id_str)
            .where("ativo", "==", True)
            # filtro por data_compra ajuda index, mas quem define inclusão é 'k' abaixo
            .where("data_compra", "<=", fim)
        )
        for doc in gastos_ref.stream():
            g = doc.to_dict() or {}
            g = self._float_para_decimal(g)
            g["doc_id"] = doc.id

            mi, ai = int(g.get("mes_inicio")), int(g.get("ano_inicio"))
            total = int(g.get("parcelas_total", 1))
            # parcela k que cai na fatura (mes/ano) consultada
            k = (ano * 12 + mes) - (ai * 12 + mi) + 1
            if 1 <= k <= total:
                # data exibida:
                # - se k == 1: data real da compra
                # - senão: 01/mes (fatura consultada)
                dt = g.get("data_compra")
                if hasattr(dt, "to_datetime"):
                    dt = dt.to_datetime()
                if not isinstance(dt, datetime):
                    dt = datetime(ano, mes, 1)

                data_item = dt if k == 1 else datetime(ano, mes, 1)

                itens.append({
                    "tipo": "Parcela",
                    "descricao": (g.get("descricao") or "").strip() or "(sem descrição)",
                    "valor": self._float_para_decimal(g.get("valor_parcela", 0.0)),
                    "data": data_item,
                    "meta": {
                        "gasto_id": g.get("id") or doc.id,
                        "parcelas_total": total,
                        "mes_inicio": mi,
                        "ano_inicio": ai,
                    }
                })

        # --- PAGAMENTOS dentro do período fechado ---
        pagamentos_ref = (
            self.db.collection(COLLECTION_PAGAMENTOS)
            .where("user_id", "==", user_id_str)
            .where("data_pagamento", ">=", inicio)
            .where("data_pagamento", "<=", fim)
        )
        for doc in pagamentos_ref.stream():
            p = doc.to_dict() or {}
            valor = self._float_para_decimal(p.get("valor", 0.0))
            data_pg = p.get("data_pagamento")
            if hasattr(data_pg, "to_datetime"):
                data_pg = data_pg.to_datetime()
            if not isinstance(data_pg, datetime):
                data_pg = inicio

            itens.append({
                "tipo": "Pagamento",
                "descricao": (p.get("descricao") or "Pagamento").strip(),
                "valor": valor,
                "data": data_pg,
                "meta": {"pagamento_id": doc.id},
            })

        itens.sort(key=lambda x: x["data"])

        total_parcelas = sum((i["valor"] for i in itens if i["tipo"] == "Parcela"), Decimal("0.00"))
        total_pag = sum((i["valor"] for i in itens if i["tipo"] == "Pagamento"), Decimal("0.00"))
        saldo = (total_parcelas - total_pag).quantize(Decimal("0.01"))

        totais = {
            "parcelas_mes": total_parcelas.quantize(Decimal("0.01")),
            "pagamentos_mes": total_pag.quantize(Decimal("0.01")),
            "saldo_mes": saldo,
            "mes_fatura": mes,
            "ano_fatura": ano,
        }
        return itens, totais

    
    def obter_extrato_fatura_aberta(self, user_id, hoje: datetime | None = None, fechamento_dia: int = 9):
        """
        Retorna os itens que irão para a PRÓXIMA fatura (ainda aberta) + pagamentos do período aberto.
        - Parcela (n/N) de todos os gastos que tenham parcela na próxima fatura
        - Para compras recentes (>= 10/..), a 1ª parcela (à vista ou n=1) entra na próxima fatura
        - Pagamentos entre o início do período aberto e 'hoje'
        """
        user_id_str = str(user_id)
        if hoje is None:
            hoje = datetime.now()

        # Referência da próxima fatura (onde as parcelas entrarão)
        mes_fat, ano_fat = self.fatura_manager.get_proxima_fatura_ref(hoje, fechamento_dia)
        

        itens = []

        # --- Todas as PARCELAS que caem na PRÓXIMA fatura ---
        gastos_ref = self.db.collection(COLLECTION_GASTOS)\
            .where("user_id", "==", user_id_str)\
            .where("ativo", "==", True)

        for doc in gastos_ref.stream():
            g = doc.to_dict() or {}
            g = self._float_para_decimal(g)
            g["doc_id"] = doc.id

            # Qual parcela cai na próxima fatura?
            mi, ai = int(g.get("mes_inicio")), int(g.get("ano_inicio"))
            k = (ano_fat * 12 + mes_fat) - (ai * 12 + mi) + 1  # 1-based
            parcelas_total = int(g.get("parcelas_total", 1))
            if 1 <= k <= parcelas_total:
                # Data para exibir:
                # - se k == 1 -> usar data_compra real
                # - senão -> data simbólica 1º/mes_fat
                dt = g.get("data_compra")
                if hasattr(dt, "to_datetime"):
                    dt = dt.to_datetime()
                if not isinstance(dt, datetime):
                    dt = datetime(ano_fat, mes_fat, 1)

                data_item = dt if k == 1 else datetime(ano_fat, mes_fat, 1)

                itens.append({
                    "tipo": "Parcela",
                    "descricao": (g.get("descricao") or "").strip() or "(sem descrição)",
                    "valor": self._float_para_decimal(g.get("valor_parcela", 0.0)),
                    "data": data_item,
                    "meta": {
                        "gasto_id": g.get("id") or doc.id,
                        "parcelas_total": parcelas_total,
                        "mes_inicio": mi,
                        "ano_inicio": ai,
                    }
                })

        # --- PAGAMENTOS no PERÍODO ABERTO ---
        inicio_aberto = self.fatura_manager.get_inicio_periodo_aberto(hoje, fechamento_dia)

        pagamentos_ref = self.db.collection(COLLECTION_PAGAMENTOS)\
            .where("user_id", "==", user_id_str)\
            .where("data_pagamento", ">=", inicio_aberto)\
            .where("data_pagamento", "<=", hoje)

        for doc in pagamentos_ref.stream():
            p = doc.to_dict() or {}
            valor = self._float_para_decimal(p.get("valor", 0.0))
            data_pg = p.get("data_pagamento")
            if hasattr(data_pg, "to_datetime"):
                data_pg = data_pg.to_datetime()
            if not isinstance(data_pg, datetime):
                data_pg = inicio_aberto

            itens.append({
                "tipo": "Pagamento",
                "descricao": (p.get("descricao") or "Pagamento").strip(),
                "valor": valor,
                "data": data_pg,
                "meta": {"pagamento_id": doc.id}
            })

        # Ordena (1ª parcela com data real; demais com 01/mes_fat)
        itens.sort(key=lambda x: x["data"])

        total_parcelas = sum((i["valor"] for i in itens if i["tipo"] == "Parcela"), Decimal("0.00"))
        total_pag = sum((i["valor"] for i in itens if i["tipo"] == "Pagamento"), Decimal("0.00"))
        saldo = (total_parcelas - total_pag).quantize(Decimal("0.01"))

        totais = {
            "parcelas_mes": total_parcelas.quantize(Decimal("0.01")),
            "pagamentos_mes": total_pag.quantize(Decimal("0.01")),
            "saldo_mes": saldo,
            # passaremos mes/ano da fatura para formatação do n/N
            "mes_fatura": mes_fat,
            "ano_fatura": ano_fat,
        }
        return itens, totais



# Instância global do bot
cartao_bot = FirebaseCartaoCreditoBot()

def criar_menu_principal(user_id):
    """Cria o teclado do menu principal"""
    keyboard = [
        [
            InlineKeyboardButton("💳 Adicionar Gasto", callback_data="menu_adicionar_gasto"),
            InlineKeyboardButton("💰 Registrar Pagamento", callback_data="menu_pagamento")
        ],
        [
            InlineKeyboardButton("📊 Meu Saldo", callback_data="menu_meu_saldo"),
            InlineKeyboardButton("📋 Meus Gastos", callback_data="menu_meus_gastos")
        ],
        [
            InlineKeyboardButton("🧾 Fatura Atual", callback_data="menu_fatura_atual"),
            InlineKeyboardButton("💸 Meus Pagamentos", callback_data="menu_meus_pagamentos")
        ],
        [
            InlineKeyboardButton("📜 Extrato do mês", callback_data="menu_extrato_mes")
        ]
    ]
    
    # Adicionar opções de administrador se for admin
    if user_id == ADMIN_ID:
        keyboard.append([
            InlineKeyboardButton("👥 Relatório Geral", callback_data="menu_relatorio_geral"),
            InlineKeyboardButton("🔍 Consultar Usuário", callback_data="menu_consultar_usuario"),
            InlineKeyboardButton("📜 Extrato por usuário", callback_data="menu_extrato_admin")
        ])
    
    keyboard.append([InlineKeyboardButton("❓ Ajuda", callback_data="menu_ajuda")])
    
    return InlineKeyboardMarkup(keyboard)

def criar_botao_cancelar():
    """Cria botão para cancelar operação atual"""
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("❌ Cancelar", callback_data="cancelar_operacao")
    ]])

async def configurar_menu_comandos(application):
    """Configura o menu de comandos do bot"""
    comandos = [
        BotCommand("start", "Iniciar o bot e ver menu principal"),
        BotCommand("menu", "Abrir menu interativo"),
        BotCommand("gasto", "Adicionar gasto (ex: /gasto Almoço 25.50 1)"),
        BotCommand("pagamento", "Registrar pagamento (ex: /pagamento 100.00)"),
        BotCommand("saldo", "Ver meu saldo atual"),
        BotCommand("fatura", "Ver fatura do mês atual"),
        BotCommand("gastos", "Ver meus gastos"),
        BotCommand("pagamentos", "Ver meus pagamentos"),
        BotCommand("ajuda", "Ver ajuda e comandos disponíveis")
    ]
    
    # Adicionar comandos de admin se necessário
    if ADMIN_ID:
        comandos.extend([
            BotCommand("relatorio", "Relatório geral (apenas administradores)"),
            BotCommand("usuario", "Consultar usuário (apenas administradores)")
        ])
    
    await application.bot.set_my_commands(comandos)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /start - Apresenta o bot com menu interativo"""
    user = update.effective_user
    user_id = user.id
    
    # Limpar estado do usuário
    context.user_data.clear()
    context.user_data['estado'] = ESTADO_NORMAL
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user.first_name, user.username)
    
    welcome_message = f"""
💳 Olá {user.first_name}! Bem-vindo ao Bot de Controle de Cartão de Crédito!

🎯 <b>Funcionalidades:</b>
• Registrar gastos com descrição e parcelas
• Acompanhar saldo devedor
• Registrar pagamentos
• Ver fatura mensal
• Histórico completo de gastos e pagamentos

🔒 <b>Privacidade:</b> Você só vê seus próprios dados.
☁️ <b>Dados seguros:</b> Armazenados no Firebase Cloud.

Use o menu abaixo para navegar:
"""

    keyboard = criar_menu_principal(user_id)
    await update.message.reply_text(
        welcome_message,
        reply_markup=keyboard,
        parse_mode="HTML"
    )


async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /menu - Mostra o menu interativo"""
    user_id = update.effective_user.id
    
    # Limpar estado do usuário
    context.user_data.clear()
    context.user_data['estado'] = ESTADO_NORMAL
    
    # Registrar usuário
    cartao_bot.registrar_usuario(update.effective_user.id, update.effective_user.first_name, update.effective_user.username)
    
    keyboard = criar_menu_principal(user_id)
    
    await update.message.reply_text(
        "💳 <b>Menu Principal</b>\n\nEscolha uma opção abaixo:",
        reply_markup=keyboard,
        parse_mode="HTML"
    )

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Manipula os callbacks dos botões inline"""
    query = update.callback_query
    user_id = query.from_user.id
    user_name = query.from_user.first_name
    data = query.data
    
    await query.answer()  # Confirma o clique do botão
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user_name, query.from_user.username)
    
    if data == "menu_principal":
        context.user_data['estado'] = ESTADO_NORMAL
        keyboard = criar_menu_principal(user_id)
        await query.edit_message_text(
            "💳 <b>Menu Principal</b>\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    elif data == "cancelar_operacao":
        context.user_data['estado'] = ESTADO_NORMAL
        keyboard = criar_menu_principal(user_id)
        await query.edit_message_text(
            "❌ <b>Operação cancelada.</b>\n\n💳 <b>Menu Principal</b>\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    elif data == "menu_adicionar_gasto":
        context.user_data['estado'] = ESTADO_AGUARDANDO_GASTO
        keyboard = criar_botao_cancelar()
        
        await query.edit_message_text(
            "💳 <b>Adicionar Gasto</b>\n\n"
            "Digite as informações do gasto no formato:\n"
            "<code>&lt;descrição&gt; &lt;valor&gt; [parcelas]</code>\n\n"
            "<b>Exemplos:</b>\n"
            "• <code>Almoço 25.50</code> - Gasto à vista\n"
            "• <code>Notebook 1200.00 12</code> - 12 parcelas de R$ 100,00\n"
            "• <code>Supermercado 89.90 1</code> - À vista (1 parcela)\n\n"
            "💡 <b>Dica:</b> Se não informar parcelas, será considerado à vista (1 parcela).\n\n"
            "✏️ <b>Aguardando sua mensagem...</b>",
            reply_markup=keyboard,
            parse_mode="HTML"
        )

    
    elif data == "menu_pagamento":
        context.user_data['estado'] = ESTADO_AGUARDANDO_PAGAMENTO
        keyboard = criar_botao_cancelar()
        
        await query.edit_message_text(
            "💰 <b>Registrar Pagamento</b>\n\n"
            "Digite as informações do pagamento no formato:\n"
            "<code>&lt;valor&gt; [descrição]</code>\n\n"
            "<b>Exemplos:</b>\n"
            "• <code>150.00</code> - Pagamento simples\n"
            "• <code>200.50 Pagamento fatura março</code> - Com descrição\n\n"
            "💡 <b>Dica:</b> O pagamento será abatido do seu saldo devedor.\n\n"
            "✏️ <b>Aguardando sua mensagem...</b>",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    elif data == "menu_consultar_usuario":
        if user_id != ADMIN_ID:
            await query.edit_message_text(
                "❌ <b>Acesso negado!</b>\n\n🔒 Apenas administradores podem consultar usuários.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
                ]]),
                parse_mode="HTML"
            )
            return
        
        context.user_data['estado'] = ESTADO_AGUARDANDO_CONSULTA_USUARIO
        keyboard = criar_botao_cancelar()
        
        await query.edit_message_text(
            "🔍 <b>Consultar Usuário - Administrador</b>\n\n"
            "Digite o nome ou username do usuário que deseja consultar:\n\n"
            "<b>Exemplos:</b>\n"
            "• `João`\n"
            "• `@maria`\n"
            "• `pedro123`\n\n"
            "✏️ <b>Aguardando sua mensagem...</b>",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    elif data == "menu_meu_saldo":
        saldo = cartao_bot.calcular_saldo_usuario(user_id)
        
        if saldo > 0:
            emoji = "🔴"
            status = "devedor"
            texto_status = f"Você deve R$ {saldo:.2f}"
        elif saldo < 0:
            emoji = "💚"
            status = "credor"
            texto_status = f"Você tem crédito de R$ {abs(saldo):.2f}"
        else:
            emoji = "⚖️"
            status = "quitado"
            texto_status = "Você está em dia!"
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(
            f"{emoji} <b>{user_name}</b>, seu saldo atual:\n\n"
            f"📊 <b>{texto_status}</b>\n\n"
            f"Status: {status.title()}\n"
            f"☁️ Dados sincronizados com Firebase",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    elif data == "menu_fatura_atual":
        # Mostra a fatura ABERTA do próprio usuário
        itens, totais = cartao_bot.obter_extrato_fatura_aberta(user_id)
        texto = montar_texto_extrato(itens, totais, mes=0, ano=0, fatura_manager=cartao_bot.fatura_manager)


        await reply_long(
            query,
            texto,
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")]])
        )

    
    elif data == "menu_meus_gastos":
        gastos = cartao_bot.obter_gastos_usuario(user_id)
        
        if gastos:
            texto_gastos = f"📋 <b>Meus Gastos ({len(gastos)} itens)</b>\n\n"
            
            for gasto in gastos[:8]:  # Mostrar apenas os primeiros 8
                parcelas_pagas = cartao_bot._calcular_parcelas_vencidas(
                    gasto, datetime.now().month, datetime.now().year
                )
                status_parcelas = f"{parcelas_pagas}/{gasto['parcelas_total']}"
                
                # Tratar data_compra que pode ser string ou datetime
                if isinstance(gasto.get("data_compra"), datetime):
                    data_compra = gasto["data_compra"].strftime("%d/%m/%y")
                else:
                    data_compra = datetime.fromisoformat(gasto["data_compra"]).strftime("%d/%m/%y")
                
                texto_gastos += f"• <b>{gasto['descricao']}</b>\n"
                texto_gastos += f"  💰 R$ {gasto['valor_total']:.2f} ({status_parcelas}x R$ {gasto['valor_parcela']:.2f})\n"
                texto_gastos += f"  📅 {data_compra}\n\n"
            
            if len(gastos) > 8:
                texto_gastos += f"... e mais {len(gastos) - 8} gastos."
        else:
            texto_gastos = "📋 <b>Meus Gastos</b>\n\n✅ Nenhum gasto registrado ainda."
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_gastos, reply_markup=keyboard,parse_mode="HTML")
    
    elif data == "menu_meus_pagamentos":
        pagamentos = cartao_bot.obter_pagamentos_usuario(user_id)
        
        if pagamentos:
            texto_pagamentos = f"💸 <b>Meus Pagamentos ({len(pagamentos)} itens)</b>\n\n"
            total_pagamentos = Decimal('0')
            
            for pagamento in pagamentos[:8]:  # Mostrar apenas os primeiros 8
                # Tratar data_pagamento que pode ser string ou datetime
                if isinstance(pagamento.get("data_pagamento"), datetime):
                    data_pagamento = pagamento["data_pagamento"].strftime("%d/%m/%y")
                else:
                    data_pagamento = datetime.fromisoformat(pagamento["data_pagamento"]).strftime("%d/%m/%y")
                
                descricao = pagamento.get('descricao', 'Pagamento')
                texto_pagamentos += f"• <b>R$ {pagamento['valor']:.2f}</b>\n"
                texto_pagamentos += f"  📝 {descricao}\n"
                texto_pagamentos += f"  📅 {data_pagamento}\n\n"
                total_pagamentos += pagamento['valor']
            
            if len(pagamentos) > 8:
                texto_pagamentos += f"... e mais {len(pagamentos) - 8} pagamentos.\n\n"
            
            texto_pagamentos += f"💰 <b>Total pago:</b> R$ {total_pagamentos:.2f}"
        else:
            texto_pagamentos = "💸 <b>Meus Pagamentos</b>\n\n✅ Nenhum pagamento registrado ainda."
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_pagamentos, reply_markup=keyboard, parse_mode="HTML")    
    elif data == "menu_relatorio_geral":
        if user_id != ADMIN_ID:
            await query.edit_message_text(
                "❌ <b>Acesso negado!</b>\n\n🔒 Apenas administradores podem acessar relatórios gerais.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
                ]]),
                parse_mode="HTML"
            )
            return
        
        relatorio = cartao_bot.obter_relatorio_completo()
        
        texto_relatorio = "👥 <b>Relatório Geral - Administrador</b>\n\n"
        texto_relatorio += f"💳 <b>Total em gastos:</b> R$ {relatorio['total_gastos']:.2f}\n"
        texto_relatorio += f"💰 <b>Total em pagamentos:</b> R$ {relatorio['total_pagamentos']:.2f}\n"
        texto_relatorio += f"📊 <b>Saldo geral:</b> R$ {relatorio['saldo_geral']:.2f}\n\n"
        texto_relatorio += f"👥 <b>Usuários ({len(relatorio['usuarios'])}):</b>\n"
        
        for usuario in relatorio['usuarios'][:10]:  # Mostrar apenas os primeiros 10
            nome = usuario['name']
            saldo = usuario['saldo']
            emoji_saldo = "🔴" if saldo > 0 else "💚" if saldo < 0 else "⚖️"
            texto_relatorio += f"{emoji_saldo} <b>{nome}:</b> R$ {saldo:.2f}\n"
        
        if len(relatorio['usuarios']) > 10:
            texto_relatorio += f"... e mais {len(relatorio['usuarios']) - 10} usuários."
        
        texto_relatorio += f"\n☁️ Dados do Firebase Firestore"
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_relatorio, reply_markup=keyboard, parse_mode="HTML")
    
    elif data == "menu_extrato_mes":
        user_id = update.effective_user.id
        itens, totais = cartao_bot.obter_extrato_fatura_aberta(user_id)
        # passe mes/ano “qualquer”, o formatter usará mes_fatura/ano_fatura vindos de 'totais'
        texto = montar_texto_extrato(itens, totais, mes=0, ano=0, fatura_manager=cartao_bot.fatura_manager)

        await reply_long(
            query,
            texto,
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Menu", callback_data="menu_principal")]])
        )



    elif data == "menu_extrato_admin":
        # somente admin
        if str(update.effective_user.id) != str(ADMIN_ID):
            await query.answer("Acesso restrito.", show_alert=True)
        else:
            context.user_data['estado'] = ESTADO_AGUARDANDO_EXTRATO_ADMIN
            await query.edit_message_text(
                "📜 <b>Extrato por usuário</b>\n\n"
                "Envie: <code>&lt;username|nome&gt; [mes ano]</code>\n"
                "Ex.: <code>@joao 8 2025</code> ou <code>maria</code>",
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ Cancelar", callback_data="cancelar_operacao")]])
            )

    
    elif data == "menu_ajuda":
        ajuda_text = """
❓ <b>Ajuda - Bot de Cartão de Crédito</b>

<b>🎛️ Interface Otimizada:</b><br>
• Clique nos botões do menu para ações rápidas<br>
• Após clicar, digite apenas as informações solicitadas<br>
• Não precisa repetir comandos após usar os botões<br>

<b>📋 Comandos principais:</b><br>
• <code>/gasto &lt;desc&gt; &lt;valor&gt; [parcelas]</code> - Registrar gasto<br>
• <code>/pagamento &lt;valor&gt; [desc]</code> - Registrar pagamento<br>
• <code>/saldo</code> - Ver saldo atual<br>
• <code>/fatura</code> - Ver fatura do mês<br>
• <code>/gastos</code> - Ver histórico de gastos<br>
• <code>/pagamentos</code> - Ver histórico de pagamentos<br>

<b>💡 Como funciona:</b><br>
• Registre seus gastos com descrição e parcelas<br>
• O bot calcula automaticamente as parcelas mensais<br>
• Registre seus pagamentos para abater da dívida<br>
• Acompanhe seu saldo devedor em tempo real<br>

<b>🔒 Privacidade:</b><br>
• Você só vê seus próprios dados<br>
• Administrador tem acesso a relatórios gerais<br>

<b>☁️ Firebase:</b><br>
• Dados armazenados com segurança na nuvem<br>
• Sincronização automática<br>
• Backup e recuperação garantidos<br>

<b>📅 Parcelas:</b><br>
• O bot controla automaticamente as parcelas<br>
• Cada mês, a parcela correspondente é adicionada à fatura<br>
• Gastos parcelados são distribuídos ao longo dos meses
"""

        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(ajuda_text, reply_markup=keyboard, parse_mode="HTML")

async def processar_mensagem_texto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Processa mensagens de texto baseado no estado atual do usuário"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    texto = update.message.text.strip()
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    estado = context.user_data.get('estado', ESTADO_NORMAL)
    
    if estado == ESTADO_AGUARDANDO_GASTO:
        await processar_gasto_otimizado(update, context, texto)
    elif estado == ESTADO_AGUARDANDO_PAGAMENTO:
        await processar_pagamento_otimizado(update, context, texto)
    elif estado == ESTADO_AGUARDANDO_CONSULTA_USUARIO:
        await processar_consulta_usuario(update, context, texto)
    elif estado == ESTADO_AGUARDANDO_EXTRATO_ADMIN:
        await processar_extrato_admin(update, context, texto)
    else:
        # Estado normal - mostrar menu
        keyboard = criar_menu_principal(user_id)
        await update.message.reply_text(
            "💳 <b>Menu Principal</b>\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard,
            parse_mode="HTML"
        )

async def processar_gasto_otimizado(update: Update, context: ContextTypes.DEFAULT_TYPE, texto: str):
    """Processa gasto no modo otimizado"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
    try:
        # Dividir o texto em partes
        partes = texto.split()
        
        if len(partes) < 2:
            await update.message.reply_text(
                "❌ <b>Formato incorreto!</b><br><br>"
                "Use: <code>&lt;descrição&gt; &lt;valor&gt; [parcelas]</code><br><br>"
                "<b>Exemplos:</b> <code>Almoço 25.50</code> ou <code>Notebook 1200.00 12</code>",
                reply_markup=criar_botao_cancelar(),
                parse_mode="HTML"
            )
            return
        
        # Extrair valor (sempre o penúltimo ou último elemento)
        valor_str = partes[-2] if len(partes) > 2 else partes[-1]
        valor = Decimal(valor_str.replace(',', '.'))
        
        # Extrair parcelas (opcional, último elemento se for número)
        parcelas = 1
        if len(partes) > 2:
            try:
                parcelas = int(partes[-1])
                if parcelas < 1:
                    parcelas = 1
                # Se conseguiu converter, a descrição vai até o antepenúltimo elemento
                descricao = " ".join(partes[:-2])
            except ValueError:
                # Se não conseguiu converter, incluir na descrição
                descricao = " ".join(partes[:-1])
                parcelas = 1
        else:
            # Apenas descrição e valor
            descricao = " ".join(partes[:-1])
            parcelas = 1
        
        if valor <= 0:
            await update.message.reply_text(
                "❌ <b>Valor deve ser maior que zero!</b>",
                reply_markup=criar_botao_cancelar(),
                parse_mode="HTML"
            )
            return
        
        if parcelas > 60:
            await update.message.reply_text(
                "❌ <b>Máximo de 60 parcelas permitido!</b>",
                reply_markup=criar_botao_cancelar(),
                parse_mode="HTML"
            )
            return
        
        # Adicionar gasto
        gasto_id = cartao_bot.adicionar_gasto(user_id, descricao, valor, parcelas)
        valor_parcela = valor / parcelas
        
        # Limpar estado
        context.user_data['estado'] = ESTADO_NORMAL
        
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💳 Adicionar Outro", callback_data="menu_adicionar_gasto")],
            [InlineKeyboardButton("📊 Ver Saldo", callback_data="menu_meu_saldo")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        if parcelas == 1:
            texto_confirmacao = (
                f"✅ <b>Gasto registrado com sucesso!</b>\n\n"
                f"📝 <b>Descrição:</b> {descricao}\n"
                f"💰 <b>Valor:</b> R$ {valor:.2f} (à vista)\n"
                f"📅 <b>Data:</b> {datetime.now().strftime('%d/%m/%Y')}\n"
                f"☁️ <b>Salvo no Firebase</b>"
            )
        else:
            texto_confirmacao = (
                f"✅ <b>Gasto registrado com sucesso!</b>\n\n"
                f"📝 <b>Descrição:</b> {descricao}\n"
                f"💰 <b>Valor total:</b> R$ {valor:.2f}\n"
                f"📊 <b>Parcelas:</b> {parcelas}x R$ {valor_parcela:.2f}\n"
                f"📅 <b>Data:</b> {datetime.now().strftime('%d/%m/%Y')}\n"
                f"☁️ <b>Salvo no Firebase</b>"
            )
        
        await update.message.reply_text(texto_confirmacao, reply_markup=keyboard, parse_mode="HTML")
        
    except (InvalidOperation, ValueError):
        await update.message.reply_text(
            "❌ <b>Erro nos dados informados!</b>\n\n"
            "Verifique se o valor está correto e as parcelas são um número inteiro.\n\n"
            "<b>Formato:</b> <descrição> <valor> [parcelas]",
            reply_markup=criar_botao_cancelar(),
            parse_mode="HTML"
        )
    except Exception as e:
        logger.error(f"Erro ao processar gasto: {e}")
        await update.message.reply_text(
            "❌ <b>Erro interno!</b>\n\n"
            "Tente novamente em alguns instantes.",
            reply_markup=criar_botao_cancelar(),
            parse_mode="HTML"
        )


async def processar_pagamento_otimizado(update: Update, context: ContextTypes.DEFAULT_TYPE, texto: str):
    """Processa pagamento no modo otimizado"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
    try:
        # Dividir o texto em partes
        partes = texto.split()
        
        if len(partes) < 1:
            await update.message.reply_text(
                "❌ <b>Formato incorreto!</b>\n\n"
                "Use: <code>&lt;valor&gt; [descrição]</code>\n\n"
                "<b>Exemplo:</b> <code>150.00</code> ou <code>200.50 Pagamento fatura março</code>",
                reply_markup=criar_botao_cancelar(),
                parse_mode="HTML"
            )
            return
        
        # Extrair valor (primeiro elemento)
        valor_str = partes[0]
        valor = Decimal(valor_str.replace(',', '.'))
        
        # Extrair descrição (resto dos elementos)
        descricao = " ".join(partes[1:]) if len(partes) > 1 else "Pagamento"
        
        if valor <= 0:
            await update.message.reply_text(
                "❌ <b>Valor deve ser maior que zero!</b>",
                reply_markup=criar_botao_cancelar()
            )
            return
        
        # Calcular saldo antes do pagamento
        saldo_antes = cartao_bot.calcular_saldo_usuario(user_id)
        
        # Adicionar pagamento
        pagamento_id = cartao_bot.adicionar_pagamento(user_id, valor, descricao)
        
        # Calcular novo saldo
        saldo_depois = cartao_bot.calcular_saldo_usuario(user_id)
        
        # Limpar estado
        context.user_data['estado'] = ESTADO_NORMAL
        
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💰 Registrar Outro", callback_data="menu_pagamento")],
            [InlineKeyboardButton("📊 Ver Saldo", callback_data="menu_meu_saldo")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        # Determinar status do saldo
        if saldo_depois > 0:
            emoji_saldo = "🔴"
            texto_saldo = f"Saldo devedor: R$ {saldo_depois:.2f}"
        elif saldo_depois < 0:
            emoji_saldo = "💚"
            texto_saldo = f"Crédito: R$ {abs(saldo_depois):.2f}"
        else:
            emoji_saldo = "⚖️"
            texto_saldo = "Conta quitada!"
        
        texto_confirmacao = (
            f"✅ <b>Pagamento registrado com sucesso!</b>\n\n"
            f"💰 <b>Valor pago:</b> R$ {valor:.2f}\n"
            f"📝 <b>Descrição:</b> {descricao}\n"
            f"📅 <b>Data:</b> {datetime.now().strftime('%d/%m/%Y')}\n\n"
            f"{emoji_saldo} <b>{texto_saldo}</b>\n"
            f"☁️ <b>Salvo no Firebase</b>"
        )
        
        await update.message.reply_text(texto_confirmacao, reply_markup=keyboard, parse_mode="HTML")
        
    except (InvalidOperation, ValueError):
        await update.message.reply_text(
            "❌ <b>Valor inválido!</b>\n\n"
            "Use apenas números.\n\n"
            "<b>Exemplos válidos:</b>\n"
            "• <code>100</code>\n"
            "• <code>150.50</code>",
            reply_markup=criar_botao_cancelar(),
            parse_mode="HTML"
        )
    except Exception as e:
        logger.error(f"Erro ao processar pagamento: {e}")
        await update.message.reply_text(
            "❌ <b>Erro interno!</b>\n\n"
            "Tente novamente em alguns instantes.",
            reply_markup=criar_botao_cancelar(),
            parse_mode="HTML"
        )


async def processar_consulta_usuario(update: Update, context: ContextTypes.DEFAULT_TYPE, texto: str):
    """Processa consulta de usuário (apenas admin)"""
    user_id = update.effective_user.id
    
    if user_id != ADMIN_ID:
        context.user_data['estado'] = ESTADO_NORMAL
        await update.message.reply_text(
            "❌ <b>Acesso negado!</b>",
            reply_markup=criar_menu_principal(user_id)
        )
        return
    
    try:
        # Buscar usuário
        termo_busca = texto.lower().replace('@', '')
        usuarios = cartao_bot.listar_todos_usuarios()
        
        usuario_encontrado = None
        for usuario in usuarios:
            nome = usuario['name'].lower()
            username = usuario.get('username', '').lower() if usuario.get('username') else ''
            
            if (termo_busca in nome or 
                termo_busca == username or 
                termo_busca in username):
                usuario_encontrado = usuario
                break
        
        # Limpar estado
        context.user_data['estado'] = ESTADO_NORMAL
        
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔍 Consultar Outro", callback_data="menu_consultar_usuario")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        if usuario_encontrado:
            user_id_consultado = int(usuario_encontrado['id'])
            saldo = usuario_encontrado['saldo']
            nome = usuario_encontrado['name']
            username = usuario_encontrado.get('username', 'N/A')
            
            gastos = cartao_bot.obter_gastos_usuario(user_id_consultado)
            pagamentos = cartao_bot.obter_pagamentos_usuario(user_id_consultado)

            # Fatura "atual" = fatura ABERTA (o que vai para a próxima fatura)
            itens_fat, totais_fat = cartao_bot.obter_extrato_fatura_aberta(user_id_consultado)
            valor_fatura = totais_fat["parcelas_mes"]
            saldo_mes    = totais_fat["saldo_mes"]

            
            # Status do saldo
            if saldo > 0:
                emoji_saldo = "🔴"
                status_saldo = f"Devedor: R$ {saldo:.2f}"
            elif saldo < 0:
                emoji_saldo = "💚"
                status_saldo = f"Crédito: R$ {abs(saldo):.2f}"
            else:
                emoji_saldo = "⚖️"
                status_saldo = "Quitado"
            
            texto_consulta = f"🔍 <b>Consulta de Usuário - Admin</b>\n\n"
            texto_consulta += f"👤 <b>Nome:</b> {nome}\n"
            texto_consulta += f"📱 <b>Username:</b> @{username}\n"
            texto_consulta += f"{emoji_saldo} <b>Saldo:</b> {status_saldo}\n"
            texto_consulta += f"💳 <b>Fatura atual (aberta):</b> R$ {valor_fatura:.2f}\n"
            texto_consulta += f"🧮 <b>Saldo do mês:</b> R$ {saldo_mes:.2f}\n"
            texto_consulta += f"📋 <b>Total de gastos:</b> {len(gastos)}\n"
            texto_consulta += f"💸 <b>Total de pagamentos:</b> {len(pagamentos)}\n"
            texto_consulta += f"☁️ <b>Dados do Firebase</b>"
            
            await update.message.reply_text(texto_consulta, reply_markup=keyboard, parse_mode="HTML")
        else:
            await update.message.reply_text(
                f"❌ <b>Usuário não encontrado!</b>\n\n"
                f"Nenhum usuário encontrado com o termo: <code>{texto}</code>\n\n"
                f"Tente buscar por nome ou username.",
                reply_markup=keyboard,
                parse_mode="HTML"
            )
    except Exception as e:
        logger.error(f"Erro ao consultar usuário: {e}")
        await update.message.reply_text(
            "❌ <b>Erro interno!</b>\n\n"
            "Tente novamente em alguns instantes.",
            reply_markup=keyboard,
            parse_mode="HTML"
        )

async def processar_extrato_admin(update, context, texto: str):
    try:
        partes = texto.split()
        if not partes:
            await update.message.reply_text(
                "❌ Formato inválido. Envie: <code>&lt;username|nome&gt; [mes ano]</code>",
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ Cancelar", callback_data="cancelar_operacao")]])
            )
            return

        termo = partes[0]
        mes = ano = None

        if len(partes) >= 3 and partes[1].isdigit() and partes[2].isdigit():
            mes, ano = int(partes[1]), int(partes[2])
        else:
            agora = datetime.now()
            mes, ano = agora.month, agora.year

        u = cartao_bot.buscar_usuario_por_nome_ou_username(termo)
        if not u:
            await update.message.reply_text(
                "❌ Usuário não encontrado.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ Cancelar", callback_data="cancelar_operacao")]])
            )
            return

        target_id_str = str(u["user_id"])

        # Só nome → fatura aberta (o que vai para a próxima fatura).
        # Nome + mes + ano → fatura fechada (consumo 10→09).
        if len(partes) == 1:
            itens, totais = cartao_bot.obter_extrato_fatura_aberta(target_id_str)
            texto_resp = (f"👤 <b>{u.get('name') or '@'+(u.get('username') or target_id_str)}</b>\n" +
                        montar_texto_extrato(itens, totais, mes=0, ano=0, fatura_manager=cartao_bot.fatura_manager))
        else:
            itens, totais = cartao_bot.obter_extrato_consumo_usuario(target_id_str, mes, ano)
            texto_resp = (f"👤 <b>{u.get('name') or '@' + (u.get('username') or target_id_str)}</b>\n" +
                        montar_texto_extrato(itens, totais, mes, ano, fatura_manager=cartao_bot.fatura_manager))

        await reply_long(
            update,
            texto_resp,
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Menu", callback_data="menu_principal")]]),
            parse_mode="HTML",
        )

    except Exception as e:
        logger.error(f"Erro no extrato admin: {e}")
        await update.message.reply_text(
            "❌ Erro ao obter extrato.",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Menu", callback_data="menu_principal")]])
        )
    finally:
        context.user_data['estado'] = ESTADO_NORMAL


# Manter comandos tradicionais para compatibilidade
async def gasto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /gasto - Adiciona um novo gasto (modo tradicional)"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
    # Limpar estado
    context.user_data['estado'] = ESTADO_NORMAL
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    if len(context.args) < 2:
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💳 Usar Menu Otimizado", callback_data="menu_adicionar_gasto")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ <b>Uso incorreto!</b>\n\n"
            "<b>Formato:</b> <code>/gasto &lt;descrição&gt; &lt;valor&gt; [parcelas]</code>\n\n"
            "<b>Exemplos:</b>\n"
            "• <code>/gasto Almoço 25.50</code>\n"
            "• <code>/gasto Notebook 1200.00 12</code>\n\n"
            "💡 <b>Dica:</b> Use o menu otimizado para uma experiência melhor!",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
        return
    
    # Processar como antes (código do gasto original)
    texto_args = " ".join(context.args)
    await processar_gasto_otimizado(update, context, texto_args)

async def pagamento(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /pagamento - Registra um pagamento (modo tradicional)"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
    # Limpar estado
    context.user_data['estado'] = ESTADO_NORMAL
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    if len(context.args) < 1:
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💰 Usar Menu Otimizado", callback_data="menu_pagamento")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ <b>Uso incorreto!</b>\n\n"
            "<b>Formato:</b> <code>/pagamento &lt;valor&gt; [descrição]</code>\n\n"
            "<b>Exemplos:</b>\n"
            "• <code>/pagamento 150.00</code>\n"
            "• <code>/pagamento 200.50 Pagamento fatura março</code>\n\n"
            "💡 <b>Dica:</b> Use o menu otimizado para uma experiência melhor!",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
        return
    
    # Processar como antes
    texto_args = " ".join(context.args)
    await processar_pagamento_otimizado(update, context, texto_args)

async def saldo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /saldo - Mostra o saldo atual"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
    # Limpar estado
    context.user_data['estado'] = ESTADO_NORMAL
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    saldo_atual = cartao_bot.calcular_saldo_usuario(user_id)
    
    if saldo_atual > 0:
        emoji = "🔴"
        status = "devedor"
        texto_status = f"Você deve R$ {saldo_atual:.2f}"
    elif saldo_atual < 0:
        emoji = "💚"
        status = "credor"
        texto_status = f"Você tem crédito de R$ {abs(saldo_atual):.2f}"
    else:
        emoji = "⚖️"
        status = "quitado"
        texto_status = "Você está em dia!"
    
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("💰 Registrar Pagamento", callback_data="menu_pagamento")],
        [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
    ])
    
    await update.message.reply_text(
        f"{emoji} <b>{user_name}</b>, seu saldo atual:\n\n"
        f"📊 <b>{texto_status}</b>\n\n"
        f"Status: {status.title()}\n"
        f"☁️ Dados sincronizados com Firebase",
        reply_markup=keyboard,
        parse_mode="HTML"
    )

async def extrato(update, context):
    user = update.effective_user
    args = context.args or []
    agora = datetime.now()

    if len(args) == 0:
        mes, ano = agora.month, agora.year
    elif len(args) == 2 and all(a.isdigit() for a in args):
        mes, ano = int(args[0]), int(args[1])
    else:
        await update.message.reply_text("Use: /extrato [mes ano]\nEx.: /extrato 8 2025")
        return

    itens, totais = cartao_bot.obter_extrato_consumo_usuario(user.id, mes, ano)
    texto = montar_texto_extrato(itens, totais, mes, ano, fatura_manager=cartao_bot.fatura_manager)
    await reply_long(update, texto, parse_mode="HTML")


# ===================== EXTRATO (HELPERS DE FORMATAÇÃO) =====================

MAX_TG = 3900  # margem de segurança (limite real ~4096)

async def reply_long(update_or_query, texto, reply_markup=None, parse_mode="HTML"):
    """
    Envia 'texto' em N mensagens se necessário. 
    Se for callback_query, usa 'edit_message_text' no primeiro envio e 'message.reply_text' nos demais.
    """
    partes = []
    atual = []
    tamanho = 0
    for linha in texto.split("\n"):
        add = (linha + "\n")
        if tamanho + len(add) > MAX_TG:
            partes.append("".join(atual))
            atual, tamanho = [add], len(add)
        else:
            atual.append(add); tamanho += len(add)
    if atual:
        partes.append("".join(atual))

    # enviar
    if hasattr(update_or_query, "edit_message_text"):  # veio de callback
        await update_or_query.edit_message_text(partes[0], parse_mode=parse_mode, reply_markup=reply_markup)
        chat = update_or_query.message.chat
        for p in partes[1:]:
            await chat.send_message(p, parse_mode=parse_mode)
    else:  # mensagem normal (/extrato)
        chat = update_or_query.effective_chat
        # primeiro pedaço pode levar o teclado, os demais sem teclado
        for idx, p in enumerate(partes):
            await chat.send_message(p, parse_mode=parse_mode, reply_markup=reply_markup if idx == 0 else None)


def montar_texto_extrato(itens, totais, mes, ano, fatura_manager: Fatura):
    def _fmt_valor_brl(d):
        if not isinstance(d, Decimal):
            try:
                d = Decimal(str(d))
            except Exception:
                d = Decimal("0")
        return f"R$ {d.quantize(Decimal('0.01')):.2f}".replace(".", ",")

    def _calc_parcela_atual(meta, m, a, fatura_manager: Fatura):
        try:
            mi = int(meta.get("mes_inicio"))
            ai = int(meta.get("ano_inicio"))
            if not (1 <= mi <= 12):
                return None
            # Calcula a diferença em meses entre a data da fatura e a data de início do gasto
            # A fatura é 1-based, então (mes_fatura, ano_fatura) - (mes_inicio, ano_inicio) + 1
            i = (int(a) * 12 + int(m)) - (ai * 12 + mi)
            return i + 1 if i >= 0 else None
        except Exception:
            return None

    # usa mês/ano da fatura (quando vierem em 'totais') – útil p/ fatura aberta
    mes_exibe = int(totais.get("mes_fatura", mes) or mes or 0)
    ano_exibe = int(totais.get("ano_fatura", ano) or ano or 0)

    linhas = []
    titulo = f"📜 <b>Extrato {mes_exibe:02d}/{ano_exibe}</b>" if (mes_exibe and ano_exibe) else "📜 <b>Extrato</b>"
    linhas.append(titulo + "\n")

    if not itens:
        linhas.append("Não há movimentações neste mês.")
    else:
        for i in itens:
            dt = i.get("data")
            if hasattr(dt, "to_datetime"):
                dt = dt.to_datetime()
            if not isinstance(dt, datetime):
                base = datetime.now()
                if mes_exibe and ano_exibe:
                    base = datetime(ano_exibe, mes_exibe, 1)
                dt = base
            data_str = dt.strftime("%d/%m")

            desc = (i.get("descricao") or "").strip() or "(sem descrição)"
            valor = _fmt_valor_brl(i.get("valor", 0))
            tipo  = i.get("tipo")

            if tipo == "Parcela":
                meta = i.get("meta") or {}
                n_atual = _calc_parcela_atual(meta, mes_exibe or mes, ano_exibe or ano, fatura_manager)
                total = meta.get("parcelas_total")
                marcador = ""
                if n_atual:
                    marcador = f" ({n_atual}/{int(total)})" if total else f" ({n_atual})"
                linhas.append(f"• {data_str} — {desc}{marcador} — {valor}")

            elif tipo == "Gasto":
                # fallback p/ caso raro de gasto à vista no pipeline fechado
                meta = i.get("meta") or {}
                n_atual = None
                total = meta.get("parcelas_total")
                if meta.get("mes_inicio") and meta.get("ano_inicio"):
                    n_atual = _calc_parcela_atual(meta, mes_exibe or mes, ano_exibe or ano, fatura_manager)
                marcador = f" ({n_atual}/{int(total)})" if (n_atual and total) else (f" ({n_atual})" if n_atual else "")
                linhas.append(f"• {data_str} — {desc}{marcador} — {valor}")

            else:  # Pagamento
                linhas.append(f"• {data_str} — <b>Pagamento</b> — {desc} — {valor}")

    linhas.append("\n<b>Totais do mês</b>")
    linhas.append(f"Parcelas: {_fmt_valor_brl(totais.get('parcelas_mes', 0))}")
    linhas.append(f"Pagamentos: {_fmt_valor_brl(totais.get('pagamentos_mes', 0))}")
    linhas.append(f"<b>Saldo do mês:</b> {_fmt_valor_brl(totais.get('saldo_mes', 0))}")

    return "\n".join(linhas)


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    err = context.error
    if isinstance(err, RetryAfter):
        logger.warning(f"Rate limit: esperar {err.retry_after}s")
        return
    if isinstance(err, (TimedOut, NetworkError)):
        logger.warning(f"Intermitência de rede/timeout: {err}")
        return

    # Log detalhado pros demais
    logger.error("Erro não tratado", exc_info=err)
    if update:
        logger.error(f"Update problemático: {update}")


async def run_telegram_bot():
    """Função para configurar e iniciar o bot do Telegram"""
    global application
    if not BOT_TOKEN:
        logger.error("❌ ERRO: BOT_TOKEN não configurado!")
        print("❌ ERRO: Configure o BOT_TOKEN no arquivo .env ou nas variáveis de ambiente do Render.")
        print("📝 Obtenha seu token em: https://t.me/BotFather")
        return
    
    if not FIREBASE_PROJECT_ID:
        logger.error("❌ ERRO: FIREBASE_PROJECT_ID não configurado!")
        print("❌ ERRO: Configure o FIREBASE_PROJECT_ID no arquivo .env ou nas variáveis de ambiente do Render.")
        print("🔥 Configure seu projeto Firebase em: https://console.firebase.google.com/")
        return
    
    # Criar aplicação
    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .request(request)
        .concurrent_updates(True)
        .post_init(configurar_menu_comandos)
        .build()
        )
    
    # Configurar menu de comandos assim que iniciar
    # application.post_init = lambda app: app.create_task(configurar_menu_comandos(app))
    
    # Adicionar handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("menu", menu))
    application.add_handler(CommandHandler("gasto", gasto))
    application.add_handler(CommandHandler("pagamento", pagamento))
    application.add_handler(CommandHandler("saldo", saldo))
    application.add_handler(CommandHandler("extrato", extrato))

    
    # Adicionar handler para callbacks dos botões
    application.add_handler(CallbackQueryHandler(callback_handler))
    
    # Adicionar handler para mensagens de texto (modo de escuta)
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, processar_mensagem_texto))
    
    # Adicionar handler de erro
    application.add_error_handler(error_handler)
    
    logger.info("💳 Bot de Controle de Cartão de Crédito com Firebase iniciado!")
    logger.info("📱 Interface otimizada ativa!")
    logger.info("☁️ Dados armazenados no Firebase Firestore!")
    
    # ✅ padrão não-bloqueante compatível com FastAPI/loop já em execução
    await application.initialize()
    await application.start()
    await application.updater.start_polling(
        drop_pending_updates=True,
        poll_interval=1.5,
        allowed_updates=Update.ALL_TYPES,
        timeout=60,
    )

    logger.info("Bot Telegram polling iniciado.")


async def start_bot():
    """Inicia o bot de forma não-bloqueante e fica 'vivo' até ser cancelado."""
    try:
        await run_telegram_bot()   # sobe a Application e inicia o updater.start_polling (não bloqueante)
        while True:
            await asyncio.sleep(3600)  # mantém a task viva
    except asyncio.CancelledError:
        logger.info("Cancel recebido: parando bot...")
        if application is not None:
            # 1) para o polling do updater primeiro
            await application.updater.stop()
            # 2) encerra a Application
            await application.stop()
            await application.shutdown()
        # repropaga o cancel para o FastAPI encerrar corretamente
        raise
    except Exception as e:
        logger.exception(f"Falha inesperada no start_bot: {e}")
        raise

class Fatura: 
    """Classe para gerenciar o ciclo de faturamento do cartão de crédito.""" 
    def __init__(self, dia_fechamento=9): 
        self.dia_fechamento = dia_fechamento 
 
    def get_periodo_fatura_atual(self, data_base=None): 
        """Retorna o período da fatura atual (aberta).""" 
        if data_base is None: 
            data_base = datetime.now() 
 
        if data_base.day > self.dia_fechamento: 
            # A fatura atual começou no dia `dia_fechamento` + 1 deste mês 
            inicio_fatura = datetime(data_base.year, data_base.month, self.dia_fechamento + 1) 
            # E fechará no próximo mês 
            if data_base.month == 12: 
                fim_fatura = datetime(data_base.year + 1, 1, self.dia_fechamento) 
            else: 
                fim_fatura = datetime(data_base.year, data_base.month + 1, self.dia_fechamento) 
        else: 
            # A fatura atual começou no mês anterior 
            if data_base.month == 1: 
                inicio_fatura = datetime(data_base.year - 1, 12, self.dia_fechamento + 1) 
            else: 
                inicio_fatura = datetime(data_base.year, data_base.month - 1, self.dia_fechamento + 1) 
            # E fechará neste mês 
            fim_fatura = datetime(data_base.year, data_base.month, self.dia_fechamento) 
 
        return inicio_fatura, fim_fatura

    def get_periodo_fatura_fechada(self, mes: int, ano: int, fechamento_dia: int = 9):
        """
        Para um (mes, ano) de FATURA, retorna (inicio, fim) do período de consumo.
        Ex.: mes=8, ano=2025 => [2025-07-10 00:00:00, 2025-08-09 23:59:59]
        """
        # o ciclo termina sempre no 'fechamento_dia' do MES informado
        fim = datetime(ano, mes, fechamento_dia, 23, 59, 59, 999999)
        # início é dia seguinte ao fechamento do mês anterior
        if mes == 1:
            inicio = datetime(ano - 1, 12, fechamento_dia, 23, 59, 59, 999999) + timedelta(seconds=1)
        else:
            inicio = datetime(ano, mes - 1, fechamento_dia, 23, 59, 59, 999999) + timedelta(seconds=1)
        # como queremos começar no dia 10, movemos 1s após as 23:59:59 do dia 09
        # (resultado: 00:00:00 do dia 10)
        return inicio, fim




    def get_proxima_fatura_ref(self, hoje: datetime, fechamento_dia: int = 9):
        """
        Retorna (mes_fatura, ano_fatura) da fatura ABERTA atual.
        Regras: se hoje.day > fechamento, a próxima fatura é (mês+1); caso contrário, é o mês atual.
        """
        mes, ano = hoje.month, hoje.year
        if hoje.day > fechamento_dia:
            # fatura que fechará no próximo mês
            if mes == 12:
                return 1, ano + 1
            return mes + 1, ano
        # ainda estamos antes/na data de fechamento -> a próxima fatura é do próprio mês
        return mes, ano




    def get_inicio_periodo_aberto(self, hoje: datetime, fechamento_dia: int = 9):
        """
        Retorna o datetime do início do período aberto (00:00 do dia 10) após o último fechamento.
        """
        if hoje.day > fechamento_dia:
            # abertura foi dia 10 deste mês
            return datetime(hoje.year, hoje.month, fechamento_dia, 23, 59, 59, 999999) + timedelta(seconds=1)
        # abertura foi dia 10 do mês anterior
        if hoje.month == 1:
            return datetime(hoje.year - 1, 12, fechamento_dia, 23, 59, 59, 999999) + timedelta(seconds=1)
        return datetime(hoje.year, hoje.month - 1, fechamento_dia, 23, 59, 59, 999999) + timedelta(seconds=1)


# A função main() original do usuário, agora renomeada para run_telegram_bot()
# e start_bot() para ser chamada pelo keep_alive.py

if __name__ == '__main__':
    # Para execução local direta (sem keep_alive.py)
    asyncio.run(run_telegram_bot())