#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# NOSONAR

import asyncio
import logging, os, re
import time
from collections import defaultdict, deque

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from enum import Enum
from redis import Redis
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters
from telegram.request import HTTPXRequest
from telegram.error import TimedOut, RetryAfter, NetworkError
from pydantic import BaseModel, Field, ValidationError
from typing import Optional
from abc import ABC, abstractmethod

# Importações do Firebase
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from config import (
    BOT_TOKEN, ADMIN_ID, ADMIN_IDS,

    FIREBASE_PROJECT_ID, FIREBASE_TYPE, FIREBASE_PRIVATE_KEY_ID, FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL, FIREBASE_CLIENT_ID, FIREBASE_AUTH_URI, FIREBASE_TOKEN_URI,
    FIREBASE_AUTH_PROVIDER_X509_CERT_URL, FIREBASE_CLIENT_X509_CERT_URL, FIREBASE_UNIVERSE_DOMAIN,
    COLLECTION_USUARIOS, COLLECTION_GASTOS, COLLECTION_PAGAMENTOS, COLLECTION_CONFIGURACOES, REDIS_URL
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

def to_naive_utc(datetime_obj):
    """Converte Firestore Timestamp, datetime aware ou epoch -> datetime naive em UTC."""
    if datetime_obj is None:
        return None
    if hasattr(datetime_obj, "to_datetime"):
        datetime_obj = datetime_obj.to_datetime()
    if isinstance(datetime_obj, (int, float)):
        datetime_obj = datetime.fromtimestamp(datetime_obj, tz=timezone.utc)
    if datetime_obj.tzinfo is not None:
        datetime_obj = datetime_obj.astimezone(timezone.utc).replace(tzinfo=None)
    return datetime_obj

def efetivo_inicio_fatura(mes_inicio:int, ano_inicio:int, dia_compra:int|None, fechamento_dia:int=9):
    """
    A primeira cobrança entra na fatura:
      - do mesmo mês, se a compra foi até o dia de fechamento;
      - do mês seguinte, se a compra foi após o dia de fechamento.
    Retorna (mes_efetivo, ano_efetivo).
    """
    mes_efetivo, ano_efetivo = int(mes_inicio), int(ano_inicio)
    if dia_compra is not None and int(dia_compra) > int(fechamento_dia):
        mes_efetivo += 1
        if mes_efetivo > 12:
            mes_efetivo = 1
            ano_efetivo += 1
    return mes_efetivo, ano_efetivo


# ===================== GERENCIADOR DE FATURA =====================
class Fatura:
    """Regras de calendário de fatura:
    - Fatura FECHADA (mês X): consumo de 10/(X-1) 00:00:00 até 09/X 23:59:59.
    - Fatura ABERTA: do instante logo após o último fechamento até 'agora'.
    """
    def __init__(self, fechamento_dia: int = 9):
        self.fechamento_dia = int(fechamento_dia)

    def get_periodo_fatura_fechada(self, mes: int, ano: int, fechamento_dia: int | None = None):
        dia_fechamento = int(fechamento_dia or self.fechamento_dia)
        # início = 10 do mês anterior 00:00:00
        if mes == 1:
            ano_anterior, mes_anterior = ano - 1, 12
        else:
            ano_anterior, mes_anterior = ano, mes - 1
        # O início é 1 segundo após o fechamento anterior
        inicio = datetime(ano_anterior, mes_anterior, dia_fechamento, 23, 59, 59, 999999) + timedelta(seconds=1)
        # O fim é exatamente no momento do fechamento atual
        fim = datetime(ano, mes, dia_fechamento, 23, 59, 59, 999999)
        return inicio, fim

    def get_proxima_fatura_ref(self, hoje: datetime | None = None, fechamento_dia: int | None = None):
        dia_fechamento = int(fechamento_dia or self.fechamento_dia)
        if hoje is None:
            hoje = datetime.now()
        if hoje.day > dia_fechamento:
            # próxima fatura é do mês seguinte
            if hoje.month == 12:
                return 1, hoje.year + 1
            return hoje.month + 1, hoje.year
        # ainda no ciclo atual
        return hoje.month, hoje.year

    def get_inicio_periodo_aberto(self, hoje: datetime | None = None, fechamento_dia: int | None = None):
        dia_fechamento = int(fechamento_dia or self.fechamento_dia)
        if hoje is None:
            hoje = datetime.now()
        if hoje.day > dia_fechamento:
            start = datetime(hoje.year, hoje.month, dia_fechamento, 23, 59, 59, 999999) + timedelta(seconds=1)
        else:
            if hoje.month == 1:
                start = datetime(hoje.year - 1, 12, dia_fechamento, 23, 59, 59, 999999) + timedelta(seconds=1)
            else:
                start = datetime(hoje.year, hoje.month - 1, dia_fechamento, 23, 59, 59, 999999) + timedelta(seconds=1)
        return start
# ================================================================


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

RATE_LIMIT_MAX_HITS = int(os.environ.get("BOT_RATE_LIMIT", "30"))
RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("BOT_RATE_WINDOW", "60"))
NAO_AUTORIZADO_MENSAGEM = (
    "⚠️ <b>Seu acesso ainda não foi liberado.</b>\n\n"
    "Abra o mini app do cartão e toque em \"Pedir liberação\" ou aguarde um administrador aprovar seu acesso."
)

# Constantes para strings duplicadas
CANCELAR = "❌ Cancelar"  # NOSONAR
MENU_PRINCIPAL_TITULO = "💳 <b>Menu Principal</b>\n\nEscolha uma opção abaixo:"
VOLTAR = "🔙 Voltar"  # NOSONAR
MENU = "🔙 Menu"  # NOSONAR
VOLTAR_MENU_PRINCIPAL = "🔙 Menu Principal"  # NOSONAR
ERRO_INTERNO = "❌ <b>Erro interno!</b>\n\n"
ACESSO_NEGADO = "❌ <b>Acesso negado!</b>\n\n🔒 Apenas administradores podem "
OPERACAO_CANCELADA = "❌ <b>Operação cancelada.</b>\n\n💳 <b>Menu Principal</b>\n\nEscolha uma opção abaixo:"
AGUARDANDO_MENSAGEM = "✏️ <b>Aguardando sua mensagem...</b>"
DATA_FORMAT = "%d/%m/%y"  # NOSONAR

ADICIONAR_GASTO_FORMATO = (
    "Digite as informações do gasto no formato:\n"
    "<code>&lt;descrição&gt; &lt;valor&gt; [parcelas]</code>\n\n"
    "<b>Exemplos:</b>\n"
    "• <code>Almoço 25.50</code> - Gasto à vista\n"
    "• <code>Notebook 1200.00 12</code> - 12 parcelas de R$ 100,00\n"
    "• <code>Supermercado 89.90 1</code> - À vista (1 parcela)\n\n"
    "💡 <b>Dica:</b> Se não informar parcelas, será considerado à vista (1 parcela).\n\n"
)

ADICIONAR_PAGAMENTO_FORMATO = (
    "Digite as informações do pagamento no formato:\n"
    "<code>&lt;valor&gt; [descrição]</code>\n\n"
    "<b>Exemplos:</b>\n"
    "• <code>150.00</code> - Pagamento simples\n"
    "• <code>200.50 Pagamento fatura março</code> - Com descrição\n\n"
    "💡 <b>Dica:</b> O pagamento será abatido do seu saldo devedor.\n\n"
)

def is_admin(user_id: int | None) -> bool:
    if user_id is None:
        return False
    try:
        return int(user_id) in ADMIN_IDS
    except (TypeError, ValueError):
        return False

class RateLimiter:
    def __init__(self, max_hits: int, window_seconds: int):
        self.max_hits = max_hits
        self.window = window_seconds
        self.hits: dict[int, deque[float]] = defaultdict(deque)

    def allow(self, key: int) -> bool:
        now = time.monotonic()
        queue = self.hits[key]
        while queue and now - queue[0] > self.window:
            queue.popleft()
        queue.append(now)
        return len(queue) <= self.max_hits

def sanitize_text(value: str, max_length: int = 120) -> str:
    if not value:
        return ""
    cleaned = re.sub(r"[<>]", "", value.strip())
    cleaned = re.sub(r"\s+", " ", cleaned)
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip()
    return cleaned

rate_limiter = RateLimiter(RATE_LIMIT_MAX_HITS, RATE_LIMIT_WINDOW_SECONDS)
application = None

async def _responder(update: Update, texto: str):
    if update.message:
        await update.message.reply_text(texto, parse_mode="HTML")
    elif update.callback_query:
        await update.callback_query.answer()
        await update.callback_query.edit_message_text(texto, parse_mode="HTML")


async def negar_acesso(update: Update):
    await _responder(update, NAO_AUTORIZADO_MENSAGEM)


async def bloquear_rate_limit(update: Update, user_id: int | None) -> bool:
    if user_id is None:
        return True
    if rate_limiter.allow(user_id):
        return False
    logger.warning(f"Rate limit exceeded by user {user_id}")
    await _responder(
        update,
        "⏳ <b>Muitas solicitações.</b>\n\nAguarde alguns segundos antes de tentar novamente."
    )
    return True


async def garantir_autorizacao(update: Update) -> bool:
    user = update.effective_user
    if user is None:
        await negar_acesso(update)
        return False
    if cartao_bot.usuario_autorizado(user.id):
        return True
    logger.warning(f"Unauthorized access attempt by user {user.id}")
    await negar_acesso(update)
    return False


class IUserRepository(ABC):
    @abstractmethod
    def registrar_usuario(self, user_id, user_name, username=None):
        pass

    @abstractmethod
    def usuario_autorizado(self, user_id: int | None) -> bool:
        pass

    @abstractmethod
    def listar_todos_usuarios(self):
        pass

    @abstractmethod
    def buscar_usuario_por_nome_ou_username(self, termo_busca: str):
        pass

class IGastoRepository(ABC):
    @abstractmethod
    def adicionar_gasto(self, user_id, descricao, valor_total, parcelas=1):
        pass

    @abstractmethod
    def obter_gastos_usuario(self, user_id):
        pass

class UserRepository(IUserRepository):
    def __init__(self, db):
        self.db = db

    def registrar_usuario(self, user_id, user_name, username=None):
        try:
            user_ref = self.db.collection(COLLECTION_USUARIOS).document(str(user_id))
            user_data = {
                "name": user_name,
                "username": username,
                "last_seen": firestore.SERVER_TIMESTAMP,
                "ativo": True,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            user_doc = user_ref.get()
            if user_doc.exists:
                user_ref.update(user_data)
            else:
                user_data["criado_em"] = firestore.SERVER_TIMESTAMP
                user_data["autorizado"] = True if is_admin(user_id) else False
                user_ref.set(user_data)
            logger.info(f"Usuário {user_id} registrado/atualizado no Firestore")
        except Exception as e:
            logger.error(f"Erro ao registrar usuário {user_id}: {e}")

    def usuario_autorizado(self, user_id: int | None) -> bool:
        if user_id is None:
            return False
        if is_admin(user_id):
            return True
        try:
            snap = self.db.collection(COLLECTION_USUARIOS).document(str(user_id)).get()
            data = snap.to_dict() or {}
            return bool(data.get("autorizado"))
        except Exception as exc:
            logger.error(f"Erro ao verificar autorização do usuário {user_id}: {exc}")
            return False

    def listar_todos_usuarios(self):
        try:
            usuarios_ref = self.db.collection(COLLECTION_USUARIOS).where("ativo", "==", True)
            usuarios = []
            for doc in usuarios_ref.stream():
                usuario = doc.to_dict()
                usuario["id"] = doc.id
                usuarios.append(usuario)
            return usuarios
        except Exception as e:
            logger.error(f"Erro ao listar usuários: {e}")
            return []

    def buscar_usuario_por_nome_ou_username(self, termo_busca: str):
        try:
            usuarios = self.listar_todos_usuarios()
            termo_lower = termo_busca.lower().replace('@', '')
            for usuario in usuarios:
                nome = usuario.get('name', '').lower()
                username = usuario.get('username', '').lower()
                if termo_lower in nome or termo_lower == username or termo_lower in username:
                    return usuario
            return None
        except Exception as e:
            logger.error(f"Erro ao buscar usuário: {e}")
            return None


class GastoRepository(IGastoRepository):
    def __init__(self, db):
        self.db = db

    def adicionar_gasto(self, user_id, descricao, valor_total, parcelas=1):
        try:
            gasto_id = f"{user_id}_{int(time.time())}"
            valor_total_decimal = Decimal(str(valor_total))
            valor_parcela_decimal = valor_total_decimal / parcelas
            agora = datetime.now()

            gasto_data = {
                "id": gasto_id,
                "user_id": str(user_id),
                "descricao": descricao,
                "valor_total": float(valor_total_decimal),
                "valor_parcela": float(valor_parcela_decimal),
                "parcelas_total": parcelas,
                "parcelas_pagas": 0,
                "data_compra": agora,
                "ativo": True,
                "mes_inicio": agora.month,
                "ano_inicio": agora.year,
                "criado_em": firestore.SERVER_TIMESTAMP,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            gasto_ref = self.db.collection(COLLECTION_GASTOS).document(gasto_id)
            gasto_ref.set(gasto_data)
            logger.info(f"Gasto {gasto_id} adicionado ao Firestore")
            return gasto_id
        except Exception as e:
            logger.error(f"Erro ao adicionar gasto: {e}")
            raise

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
            
            for doc in gastos_query.stream():
                gasto = self._float_para_decimal(doc.to_dict())
                if isinstance(gasto.get("data_compra"), datetime):
                    gasto["data_compra"] = gasto["data_compra"].isoformat()
                gastos_usuario.append(gasto)
            return gastos_usuario
        except Exception as e:
            logger.error(f"Erro ao obter gastos do usuário {user_id}: {e}")
            return []

    def _float_para_decimal(self, obj):
        if isinstance(obj, (int, float)) and not isinstance(obj, bool):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {key: self._float_para_decimal(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._float_para_decimal(item) for item in obj]
        return obj


class FirebaseCartaoCreditoBot:
    def __init__(self):
        self.db = self._inicializar_firebase()
        self._inicializar_configuracoes()
        self.fatura_manager = Fatura()
        self.user_repo = UserRepository(self.db)
        self.gasto_repo = GastoRepository(self.db)
        self.redis_client = None
        if REDIS_URL:
            try:
                self.redis_client = Redis.from_url(
                    REDIS_URL,
                    socket_connect_timeout=2,
                    socket_timeout=2,
                )
                self.redis_client.ping()
                logger.info("Redis conectado e respondendo (PING OK)")
            except Exception as e:
                self.redis_client = None
                logger.warning(f"Redis não disponível: {e}")

    def _inicializar_firebase(self):
        try:
            firebase_admin.get_app()
            logger.info("Firebase já inicializado")
        except ValueError:
            if (FIREBASE_TYPE and FIREBASE_PROJECT_ID and FIREBASE_PRIVATE_KEY_ID and
                FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL and FIREBASE_CLIENT_ID and
                FIREBASE_AUTH_URI and FIREBASE_TOKEN_URI and FIREBASE_AUTH_PROVIDER_X509_CERT_URL and
                FIREBASE_CLIENT_X509_CERT_URL and FIREBASE_UNIVERSE_DOMAIN):
                cred_dict = {
                    "type": FIREBASE_TYPE,
                    "project_id": FIREBASE_PROJECT_ID,
                    "private_key_id": FIREBASE_PRIVATE_KEY_ID,
                    "private_key": FIREBASE_PRIVATE_KEY.replace("\\n", "\n"),
                    "client_email": FIREBASE_CLIENT_EMAIL,
                    "client_id": FIREBASE_CLIENT_ID,
                    "auth_uri": FIREBASE_AUTH_URI,
                    "token_uri": FIREBASE_TOKEN_URI,
                    "auth_provider_x509_cert_url": FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
                    "client_x509_cert_url": FIREBASE_CLIENT_X509_CERT_URL,
                    "universe_domain": FIREBASE_UNIVERSE_DOMAIN
                }
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred, {'projectId': FIREBASE_PROJECT_ID})
            else:
                logger.warning("Variáveis de ambiente do Firebase incompletas. Tentando credenciais padrão.")
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred, {'projectId': FIREBASE_PROJECT_ID})
            logger.info("Firebase inicializado com sucesso")
        return firestore.client()
    
    def _inicializar_configuracoes(self):
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
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {key: self._decimal_para_float(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._decimal_para_float(item) for item in obj]
        return obj

    def _float_para_decimal(self, obj):
        if isinstance(obj, (int, float)) and not isinstance(obj, bool):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {key: self._float_para_decimal(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._float_para_decimal(item) for item in obj]
        return obj
    
    def registrar_usuario(self, user_id, user_name, username=None):
        try:
            user_ref = self.db.collection(COLLECTION_USUARIOS).document(str(user_id))
            user_data = {
                "name": user_name,
                "username": username,
                "last_seen": firestore.SERVER_TIMESTAMP,
                "ativo": True,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            user_doc = user_ref.get()
            if user_doc.exists:
                user_ref.update(user_data)
            else:
                user_data["criado_em"] = firestore.SERVER_TIMESTAMP
                user_data["autorizado"] = True if is_admin(user_id) else False
                user_ref.set(user_data)
            logger.info(f"Usuário {user_id} registrado/atualizado no Firestore")
        except Exception as e:
            logger.error(f"Erro ao registrar usuário {user_id}: {e}")

    def usuario_autorizado(self, user_id: int | None) -> bool:
        if user_id is None:
            return False
        if is_admin(user_id):
            return True
        try:
            snap = self.db.collection(COLLECTION_USUARIOS).document(str(user_id)).get()
            data = snap.to_dict() or {}
            return bool(data.get("autorizado"))
        except Exception as exc:
            logger.error(f"Erro ao verificar autorização do usuário {user_id}: {exc}")
            return False
    
    def adicionar_gasto(self, user_id, descricao, valor_total, parcelas=1):
        try:
            gasto_id = f"{user_id}_{int(time.time())}"
            valor_total_decimal = Decimal(str(valor_total))
            valor_parcela_decimal = valor_total_decimal / parcelas
            agora = datetime.now()

            gasto_data = {
                "id": gasto_id,
                "user_id": str(user_id),
                "descricao": descricao,
                "valor_total": float(valor_total_decimal),
                "valor_parcela": float(valor_parcela_decimal),
                "parcelas_total": parcelas,
                "parcelas_pagas": 0,
                "data_compra": agora,
                "ativo": True,
                "mes_inicio": agora.month,
                "ano_inicio": agora.year,
                "criado_em": firestore.SERVER_TIMESTAMP,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
            gasto_ref = self.db.collection(COLLECTION_GASTOS).document(gasto_id)
            gasto_ref.set(gasto_data)
            logger.info(f"Gasto {gasto_id} adicionado ao Firestore")
            return gasto_id
        except Exception as e:
            logger.error(f"Erro ao adicionar gasto: {e}")
            raise
    
    def adicionar_pagamento(self, user_id, valor, descricao=""):
        try:
            pagamento_id = f"pag_{user_id}_{int(time.time())}"
            valor_decimal = Decimal(str(valor))
            agora = datetime.now()

            pagamento_data = {
                "id": pagamento_id,
                "user_id": str(user_id),
                "valor": float(valor_decimal),
                "descricao": descricao,
                "data_pagamento": agora,
                "mes": agora.month,
                "ano": agora.year,
                "criado_em": firestore.SERVER_TIMESTAMP,
                "atualizado_em": firestore.SERVER_TIMESTAMP
            }
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
                def _gasto_tem_parcela_no_mes(self, gasto, mes, ano):  # NOSONAR
                    """
                    True se há parcela deste gasto na fatura (mes/ano).
                    Respeita o fechamento no dia 09: compras do dia 10..31
                    entram na fatura do mês seguinte.
                    """
                    dtc = to_naive_utc(gasto.get("data_compra"))
                    dia = dtc.day if isinstance(dtc, datetime) else None

                    # mês/ano "efetivos" da 1ª parcela (ajustados pelo fechamento)
                    m0, a0 = efetivo_inicio_fatura(
                        gasto["mes_inicio"], gasto["ano_inicio"], dia, self.fatura_manager.fechamento_dia
                    )

                    idx = (int(ano) * 12 + int(mes)) - (a0 * 12 + m0)  # 0 = primeira parcela
                    total = int(gasto.get("parcelas_total", 1))
                    return 0 <= idx < total

            
            return total_fatura, gastos_mes
        except Exception as e:
            logger.error(f"Erro ao calcular fatura do usuário {user_id}: {e}")
            return Decimal('0'), []
    
    def _gasto_tem_parcela_no_mes(self, gasto, mes, ano):
        """
        True se há parcela deste gasto na fatura (mes/ano).
        Respeita o fechamento no dia 09: compras do dia 10..31
        entram na fatura do mês seguinte.
        """
        dtc = to_naive_utc(gasto.get("data_compra"))
        dia = dtc.day if isinstance(dtc, datetime) else None

        # mês/ano "efetivos" da 1ª parcela (ajustados pelo fechamento)
        m0, a0 = efetivo_inicio_fatura(
            gasto["mes_inicio"], gasto["ano_inicio"], dia, self.fatura_manager.fechamento_dia
        )

        idx = (int(ano) * 12 + int(mes)) - (a0 * 12 + m0)  # 0 = primeira parcela
        total = int(gasto.get("parcelas_total", 1))
        return 0 <= idx < total

    
    def calcular_saldo_usuario(self, user_id: int):
        key = f"saldo:{user_id}"
        if self.redis_client:
            try:
                cached = self.redis_client.get(key)
                if cached:
                    return Decimal(cached.decode())
            except Exception:
                pass
        
        user_id_str = str(user_id)
        try:
            total_gastos_devidos = Decimal('0')
            agora = datetime.now()

            gastos_query = self.db.collection(COLLECTION_GASTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            ).where(
                filter=FieldFilter("ativo", "==", True)
            )

            for gasto_doc in gastos_query.stream():
                gasto_dict = self._float_para_decimal(gasto_doc.to_dict())
                # ✅ CORREÇÃO: Chama a função corrigida para um saldo preciso
                parcelas_devidas = self._calcular_parcelas_vencidas(gasto_dict, agora.month, agora.year)
                total_gastos_devidos += gasto_dict["valor_parcela"] * parcelas_devidas

            total_pagamentos = Decimal('0')
            pagamentos_query = self.db.collection(COLLECTION_PAGAMENTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            )

            for pagamento_doc in pagamentos_query.stream():
                pagamento_dict = self._float_para_decimal(pagamento_doc.to_dict())
                total_pagamentos += pagamento_dict["valor"]

            saldo = (total_gastos_devidos - total_pagamentos).quantize(Decimal("0.01"))
            if self.redis_client:
                try:
                    self.redis_client.set(key, str(saldo), ex=3600)
                except Exception:
                    pass
            return saldo
        except Exception as e:
            logger.error(f"Erro ao calcular saldo do usuário {user_id}: {e}")
            return Decimal('0')
    
    # ✅ CORREÇÃO: Respeita o dia de fechamento para um cálculo de saldo consistente.
    def _calcular_parcelas_vencidas(self, gasto: dict, mes_referencia: int, ano_referencia: int):
        """
        Calcula quantas parcelas de um gasto já deveriam ter sido cobradas até a fatura de (mes_referencia/ano_referencia).
        """
        datetime_compra = to_naive_utc(gasto.get("data_compra"))
        dia_compra = datetime_compra.day if isinstance(datetime_compra, datetime) else None

        # Usa a mesma lógica dos extratos para saber o mês/ano de início efetivo da cobrança
        mes_efetivo_inicio, ano_efetivo_inicio = efetivo_inicio_fatura(
            gasto["mes_inicio"], gasto["ano_inicio"], dia_compra, self.fatura_manager.fechamento_dia
        )

        # Calcula quantos meses se passaram desde a primeira cobrança até a fatura de referência
        meses_passados = (ano_referencia - ano_efetivo_inicio) * 12 + (mes_referencia - mes_efetivo_inicio) + 1

        return min(max(0, meses_passados), int(gasto["parcelas_total"]))
    
    def obter_pagamentos_usuario(self, user_id):
        """Obtém todos os pagamentos de um usuário do Firestore"""
        user_id_str = str(user_id)
        pagamentos_usuario = []
        try:
            pagamentos_query = self.db.collection(COLLECTION_PAGAMENTOS).where(
                filter=FieldFilter("user_id", "==", user_id_str)
            ).order_by("data_pagamento", direction=firestore.Query.DESCENDING)
            
            for doc in pagamentos_query.stream():
                pagamento = self._float_para_decimal(doc.to_dict())
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
            return user_doc.to_dict() if user_doc.exists else None
        except Exception as e:
            logger.error(f"Erro ao obter info do usuário {user_id}: {e}")
            return None
    
    def listar_todos_usuarios(self):
        """Lista todos os usuários ativos do Firestore (apenas para admin)"""
        usuarios = []
        try:
            usuarios_docs = self.db.collection(COLLECTION_USUARIOS).where(filter=FieldFilter("ativo", "==", True)).stream()
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
    
    def obter_relatorio_completo(self):  # NOSONAR
        """Obtém relatório completo para administrador"""
        relatorio = {
            "usuarios": self.listar_todos_usuarios(),
            "total_gastos": Decimal('0'),
            "total_pagamentos": Decimal('0'),
            "saldo_geral": Decimal('0')
        }
        
        try:
            agora = datetime.now()
            gastos_docs = self.db.collection(COLLECTION_GASTOS).where(filter=FieldFilter("ativo", "==", True)).stream()
            for doc in gastos_docs:
                gasto = self._float_para_decimal(doc.to_dict())
                parcelas_vencidas = self._calcular_parcelas_vencidas(gasto, agora.month, agora.year)
                relatorio["total_gastos"] += gasto["valor_parcela"] * parcelas_vencidas

            pagamentos_docs = self.db.collection(COLLECTION_PAGAMENTOS).stream()
            for doc in pagamentos_docs:
                pagamento = self._float_para_decimal(doc.to_dict())
                relatorio["total_pagamentos"] += pagamento["valor"]

            relatorio["saldo_geral"] = relatorio["total_gastos"] - relatorio["total_pagamentos"]
            return relatorio
        except Exception as e:
            logger.error(f"Erro ao obter relatório completo: {e}")
            return relatorio
        
     # ===================== EXTRATO (DATA LAYER) =====================       
    # ✅ CORREÇÃO: Função renomeada e lógica simplificada para processar um único gasto.
    def _gerar_item_de_extrato_se_pertence_ao_mes(self, gasto: dict, mes_fatura: int, ano_fatura: int):
        """
        Verifica se um gasto tem parcela na fatura (mes/ano) e, se tiver,
        retorna o dicionário do item para o extrato.
        """
        if not gasto.get("ativo", True):
            return None

        datetime_compra = to_naive_utc(gasto.get("data_compra"))
        mes_inicio_compra = int(gasto.get("mes_inicio") or (datetime_compra.month if datetime_compra else mes_fatura))
        ano_inicio_compra = int(gasto.get("ano_inicio") or (datetime_compra.year if datetime_compra else ano_fatura))
        dia_compra = datetime_compra.day if isinstance(datetime_compra, datetime) else self.fatura_manager.fechamento_dia + 1
        total_parcelas = int(gasto.get("parcelas_total") or 1)

        # Ajusta o mês/ano de início para a "primeira fatura"
        mes_efetivo_inicio, ano_efetivo_inicio = efetivo_inicio_fatura(
            mes_inicio_compra, ano_inicio_compra, dia_compra, self.fatura_manager.fechamento_dia
        )

        # Calcula qual parcela (indice) cai NA fatura (mes, ano)
        numero_parcela_na_fatura = (int(ano_fatura) * 12 + int(mes_fatura)) - (ano_efetivo_inicio * 12 + mes_efetivo_inicio) + 1

        if 1 <= numero_parcela_na_fatura <= total_parcelas:
            valor_item = Decimal(str(
                gasto.get("valor_parcela") if total_parcelas > 1 else gasto.get("valor_total")
            ))
            return {
                "tipo": "Parcela" if total_parcelas > 1 else "Gasto",
                "descricao": gasto.get("descricao", ""),
                "valor": valor_item,
                "data": datetime_compra or datetime(int(ano_fatura), int(mes_fatura), 1),
                "meta": {
                    "gasto_id": gasto.get("id"),
                    "parcelas_total": total_parcelas,
                    "parcela_num": numero_parcela_na_fatura,
                    "mes_inicio": mes_inicio_compra,
                    "ano_inicio": ano_inicio_compra,
                    "dia_compra": dia_compra,
                },
            }
        return None
    
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
            data_pg_raw = p.get("data_pagamento")
            data_pg = to_naive_utc(data_pg_raw) or datetime(int(ano), int(mes), 1)
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
    
    def buscar_usuario_por_nome_ou_username(self, termo_busca: str):
        """
        Procura um usuário por username (com ou sem @) ou por 'name' contendo termo (case-insensitive).
        Retorna dict do usuário ou None.
        """
        termo_busca = (termo_busca or "").strip()
        if termo_busca.startswith("@"):
            termo_busca = termo_busca[1:]

        # 1) Tenta username exato
        query_username = self.db.collection(COLLECTION_USUARIOS).where("username", "==", termo_busca).limit(1).stream()
        for doc in query_username:
            usuario = doc.to_dict() or {}
            usuario["user_id"] = doc.id
            return usuario

        # 2) Tenta nome contendo termo (ingênuo; Firestore não tem contains nativo, então guardamos variantes)
        # fallback: buscar todos e filtrar em memória (se sua base for pequena)
        try:
            todos_usuarios = self.db.collection(COLLECTION_USUARIOS).stream()
            termo_busca_lower = termo_busca.lower()
            for doc in todos_usuarios:
                usuario = doc.to_dict() or {}
                nome = (usuario.get("name") or "").lower()
                if termo_busca_lower in nome:
                    usuario["user_id"] = doc.id
                    return usuario
        except Exception as e:
            logger.error(f"Erro ao buscar usuário por nome: {e}")

        return None
    
    # ✅ CORREÇÃO: Lógica de extrato de fatura fechada refatorada para ser mais robusta.
    def obter_extrato_consumo_usuario(self, user_id: int, mes: int, ano: int, fechamento_dia: int = 9):
        """
        Extrato de uma FATURA FECHADA (consumo de 10/mes-1 a 09/mes).
        Emite PARCELAS (n/N) que caem nessa fatura; à vista => n=1/N=1
        Também inclui pagamentos dentro do mesmo período.
        """
        user_id_str = str(user_id)
        inicio_periodo, fim_periodo = self.fatura_manager.get_periodo_fatura_fechada(mes, ano, fechamento_dia)
        itens_extrato = []

        gastos_ref = (
            self.db.collection(COLLECTION_GASTOS)
            .where("user_id", "==", user_id_str)
            .where("ativo", "==", True)
            .where("data_compra", "<=", fim_periodo)
        )
        for gasto_doc in gastos_ref.stream():
            gasto = self._float_para_decimal(gasto_doc.to_dict() or {})
            item_extrato = self._gerar_item_de_extrato_se_pertence_ao_mes(gasto, mes, ano)
            if item_extrato:
                itens_extrato.append(item_extrato)

        pagamentos_ref = (
            self.db.collection(COLLECTION_PAGAMENTOS)
            .where("user_id", "==", user_id_str)
            .where("data_pagamento", ">=", inicio_periodo)
            .where("data_pagamento", "<=", fim_periodo)
        )
        for pagamento_doc in pagamentos_ref.stream():
            pagamento = self._float_para_decimal(pagamento_doc.to_dict() or {})
            valor = pagamento.get("valor", Decimal("0.0"))
            data_pagamento = to_naive_utc(pagamento.get("data_pagamento")) or inicio_periodo

            itens_extrato.append({
                "tipo": "Pagamento",
                "descricao": (pagamento.get("descricao") or "Pagamento").strip(),
                "valor": valor,
                "data": data_pagamento,
                "meta": {"pagamento_id": pagamento_doc.id}
            })

        itens_extrato.sort(key=lambda item: item["data"])

        total_parcelas = sum((item["valor"] for item in itens_extrato if item["tipo"] in ["Parcela", "Gasto"]), Decimal("0.00"))
        total_pagamentos = sum((item["valor"] for item in itens_extrato if item["tipo"] == "Pagamento"), Decimal("0.00"))
        saldo_mes = (total_parcelas - total_pagamentos).quantize(Decimal("0.01"))

        totais = {
            "parcelas_mes": total_parcelas,
            "pagamentos_mes": total_pagamentos,
            "saldo_mes": saldo_mes,
            "mes_fatura": mes,
            "ano_fatura": ano,
        }
        return itens_extrato, totais


    # ✅ CORREÇÃO: Lógica de fatura aberta agora mostra APENAS os novos gastos.
    def obter_extrato_fatura_aberta(self, user_id, hoje: datetime | None = None, fechamento_dia: int = 9):
        """
        Retorna os itens (APENAS GASTOS) que irão para a PRÓXIMA fatura (ainda aberta).
        Pagamentos não são mostrados aqui, pois referem-se a faturas fechadas.
        """
        user_id_str = str(user_id)
        if hoje is None:
            hoje = datetime.now()
        hoje_utc = to_naive_utc(hoje)

        mes_proxima_fatura, ano_proxima_fatura = self.fatura_manager.get_proxima_fatura_ref(hoje_utc, fechamento_dia)
        itens_extrato = []

        # --- Busca todas as parcelas de gastos que caem na PRÓXIMA fatura ---
        gastos_ref = self.db.collection(COLLECTION_GASTOS)\
            .where("user_id", "==", user_id_str)\
            .where("ativo", "==", True)

        for gasto_doc in gastos_ref.stream():
            gasto = self._float_para_decimal(gasto_doc.to_dict() or {})
            item = self._gerar_item_de_extrato_se_pertence_ao_mes(gasto, mes_proxima_fatura, ano_proxima_fatura)
            if item:
                itens_extrato.append(item)

        # O bloco que buscava pagamentos foi REMOVIDO daqui.

        itens_extrato.sort(key=lambda item: item["data"])

        total_parcelas = sum((item["valor"] for item in itens_extrato if item["tipo"] in ["Parcela", "Gasto"]), Decimal("0.00"))
        
        # Como não há pagamentos nesta visualização, o saldo do período é simplesmente o total de gastos.
        totais = {
            "parcelas_mes": total_parcelas,
            "pagamentos_mes": Decimal("0.00"), # Pagamentos não são considerados aqui
            "saldo_mes": total_parcelas,      # O saldo é o total a pagar na próxima fatura
            "mes_fatura": mes_proxima_fatura,
            "ano_fatura": ano_proxima_fatura,
        }
        return itens_extrato, totais


# ===================== DEMAIS FUNÇÕES DO BOT (SEM MUDANÇAS SIGNIFICATIVAS, APENAS CHAMADAS AJUSTADAS) =====================
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
    user = update.effective_user
    if await bloquear_rate_limit(update, user.id):
        return
    if not await garantir_autorizacao(update):
        return
    context.user_data.clear()
    context.user_data['estado'] = ESTADO_NORMAL
    cartao_bot.registrar_usuario(user.id, user.first_name, user.username)
    
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

    keyboard = criar_menu_principal(user.id)
    await update.message.reply_text(
        welcome_message,
        reply_markup=keyboard,
        parse_mode="HTML"
    )


async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if await bloquear_rate_limit(update, user.id):
        return
    if not await garantir_autorizacao(update):
        return
    context.user_data.clear()
    context.user_data['estado'] = ESTADO_NORMAL
    cartao_bot.registrar_usuario(user.id, user.first_name, user.username)
    keyboard = criar_menu_principal(user.id)
    await update.message.reply_text(MENU_PRINCIPAL_TITULO, reply_markup=keyboard, parse_mode="HTML")


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):  # NOSONAR
    """Manipula os callbacks dos botões inline"""
    query = update.callback_query
    user_id = query.from_user.id
    user_name = query.from_user.first_name
    if await bloquear_rate_limit(update, user_id):
        return
    if not await garantir_autorizacao(update):
        return
    data = query.data
    await query.answer()
    cartao_bot.registrar_usuario(user_id, user_name, query.from_user.username)
    
    if data == "menu_principal":
        context.user_data['estado'] = ESTADO_NORMAL
        keyboard = criar_menu_principal(user_id)
        await query.edit_message_text(
            MENU_PRINCIPAL_TITULO,
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    elif data == "cancelar_operacao":
        context.user_data['estado'] = ESTADO_NORMAL
        keyboard = criar_menu_principal(user_id)
        await query.edit_message_text(
            OPERACAO_CANCELADA,
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
            "💰 <b>Registrar Pagamento</b>\n\n" +
            "Digite as informações do pagamento no formato:\n" +
            "<code>&lt;valor&gt; [descrição]</code>\n\n" +
            "<b>Exemplos:</b>\n" +
            "• <code>150.00</code> - Pagamento simples\n" +
            "• <code>200.50 Pagamento fatura março</code> - Com descrição\n\n" +
            "💡 <b>Dica:</b> O pagamento será abatido do seu saldo devedor.\n\n" +
            AGUARDANDO_MENSAGEM,
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    elif data == "menu_consultar_usuario":
        if user_id != ADMIN_ID:
            await query.edit_message_text(
                ACESSO_NEGADO + "consultar usuários.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton(VOLTAR, callback_data="menu_principal")
                ]]),
                parse_mode="HTML"
            )
            return
        
        context.user_data['estado'] = ESTADO_AGUARDANDO_CONSULTA_USUARIO
        keyboard = criar_botao_cancelar()
        
        text = """🔍 <b>Consultar Usuário - Administrador</b>\n\nDigite o nome ou username do usuário que deseja consultar:\n\n<b>Exemplos:</b>\n• `João`\n• `@maria`\n• `pedro123`\n\n""" + AGUARDANDO_MENSAGEM
        
        await query.edit_message_text(
            text,
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
        # CORREÇÃO: Argumentos 'mes' e 'ano' renomeados para 'mes_referencia' e 'ano_referencia'
        texto = montar_texto_extrato(itens, totais, mes_referencia=0, ano_referencia=0, fatura_manager=cartao_bot.fatura_manager)

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
                ACESSO_NEGADO + "acessar relatórios gerais.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton(VOLTAR, callback_data="menu_principal")
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
            if saldo > 0:
                emoji_saldo = "🔴"
            elif saldo < 0:
                emoji_saldo = "💚"
            else:
                emoji_saldo = "⚖️"
            texto_relatorio += f"{emoji_saldo} <b>{nome}:</b> R$ {saldo:.2f}\n"
        
        if len(relatorio['usuarios']) > 10:
            texto_relatorio += f"... e mais {len(relatorio['usuarios']) - 10} usuários."
        
        texto_relatorio += "\n☁️ Dados do Firebase Firestore"
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_relatorio, reply_markup=keyboard, parse_mode="HTML")
    
    elif data == "menu_extrato_mes":
        # Nota: Esta opção parece ter a mesma funcionalidade de "menu_fatura_atual".
        # Ambas buscam a fatura aberta.
        itens, totais = cartao_bot.obter_extrato_fatura_aberta(user_id)
        # CORREÇÃO: Argumentos 'mes' e 'ano' renomeados para 'mes_referencia' e 'ano_referencia'
        texto = montar_texto_extrato(itens, totais, mes_referencia=0, ano_referencia=0, fatura_manager=cartao_bot.fatura_manager)

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
    _user_name = update.effective_user.first_name
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
            MENU_PRINCIPAL_TITULO,
            reply_markup=keyboard,
            parse_mode="HTML"
        )

from pydantic import BaseModel, validator, Field
from typing import Optional

class GastoInput(BaseModel):
    descricao: str = Field(..., max_length=120, description="Descrição do gasto")
    valor: float = Field(..., gt=0, description="Valor do gasto em reais")
    parcelas: int = Field(default=1, ge=1, le=60, description="Número de parcelas")

class PagamentoInput(BaseModel):
    valor: float = Field(..., gt=0, description="Valor do pagamento em reais")
    descricao: Optional[str] = Field(None, max_length=120, description="Descrição opcional do pagamento")

async def processar_gasto_otimizado(update: Update, context: ContextTypes.DEFAULT_TYPE, texto: str):
    """Processa gasto no modo otimizado"""
    user_id = update.effective_user.id
    _user_name = update.effective_user.first_name
    
    try:
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
        
        # Usar validação pydantic
        partes[0] = sanitize_text(partes[0])
        if len(partes) == 2:
            gasto_input = GastoInput(descricao=partes[0], valor=float(partes[1]))
        else:
            gasto_input = GastoInput(descricao=partes[0], valor=float(partes[1]), parcelas=int(partes[2]))
        
        descricao = gasto_input.descricao
        valor = gasto_input.valor
        parcelas = gasto_input.parcelas
        
        # Adicionar gasto
        _gasto_id = cartao_bot.adicionar_gasto(user_id, descricao, valor, parcelas)
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
        
    except Exception as e:
        logger.error(f"Erro ao processar gasto: {e}")
        await update.message.reply_text(
            ERRO_INTERNO
            "Tente novamente em alguns instantes.",
            reply_markup=criar_botao_cancelar(),
            parse_mode="HTML"
        )


async def processar_pagamento_otimizado(update: Update, context: ContextTypes.DEFAULT_TYPE, texto: str):
    """Processa pagamento no modo otimizado"""
    user_id = update.effective_user.id
    _user_name = update.effective_user.first_name
    
    try:
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
        
        # Usar validação pydantic
        pagamento_input = PagamentoInput(valor=float(partes[0]), descricao=sanitize_text(" ".join(partes[1:])) if len(partes) > 1 else None)
        
        valor = pagamento_input.valor
        descricao = pagamento_input.descricao
        
        # Calcular saldo antes do pagamento
        _saldo_antes = cartao_bot.calcular_saldo_usuario(user_id)
        
        # Adicionar pagamento
        _pagamento_id = cartao_bot.adicionar_pagamento(user_id, valor, descricao)
        
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
        
    except Exception as e:
        logger.error(f"Erro ao processar pagamento: {e}")
        await update.message.reply_text(
            ERRO_INTERNO
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
            _itens_fat, totais_fat = cartao_bot.obter_extrato_fatura_aberta(user_id_consultado)
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
            
            texto_consulta = "🔍 <b>Consulta de Usuário - Admin</b>\n\n"
            texto_consulta += f"👤 <b>Nome:</b> {nome}\n"
            texto_consulta += f"📱 <b>Username:</b> @{username}\n"
            texto_consulta += f"{emoji_saldo} <b>Saldo:</b> {status_saldo}\n"
            texto_consulta += f"💳 <b>Fatura atual (aberta):</b> R$ {valor_fatura:.2f}\n"
            texto_consulta += f"🧮 <b>Saldo do mês:</b> R$ {saldo_mes:.2f}\n"
            texto_consulta += f"📋 <b>Total de gastos:</b> {len(gastos)}\n"
            texto_consulta += f"💸 <b>Total de pagamentos:</b> {len(pagamentos)}\n"
            texto_consulta += "☁️ <b>Dados do Firebase</b>"
            
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
            ERRO_INTERNO
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

        termo_busca = partes[0]
        mes, ano = None, None

        if len(partes) >= 3 and partes[1].isdigit() and partes[2].isdigit():
            mes, ano = int(partes[1]), int(partes[2])
        else:
            agora = datetime.now()
            mes, ano = agora.month, agora.year

        usuario = cartao_bot.buscar_usuario_por_nome_ou_username(termo_busca)
        if not usuario:
            await update.message.reply_text(
                "❌ Usuário não encontrado.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ Cancelar", callback_data="cancelar_operacao")]])
            )
            return

        target_id_str = str(usuario["user_id"])
        nome_exibicao = usuario.get('name') or '@' + (usuario.get('username') or target_id_str)

        if len(partes) == 1:
            itens, totais = cartao_bot.obter_extrato_fatura_aberta(target_id_str)
            # CORREÇÃO: Argumentos 'mes' e 'ano' renomeados para 'mes_referencia' e 'ano_referencia'
            texto_resp = (f"👤 <b>{nome_exibicao}</b>\n" +
                        montar_texto_extrato(itens, totais, mes_referencia=0, ano_referencia=0, fatura_manager=cartao_bot.fatura_manager))
        else:
            itens, totais = cartao_bot.obter_extrato_consumo_usuario(target_id_str, mes, ano)
            # CORREÇÃO: Argumentos 'mes' e 'ano' renomeados para 'mes_referencia' e 'ano_referencia'
            texto_resp = (f"👤 <b>{nome_exibicao}</b>\n" +
                        montar_texto_extrato(itens, totais, mes_referencia=mes, ano_referencia=ano, fatura_manager=cartao_bot.fatura_manager))

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

    mes_arg, ano_arg = None, None

    if len(args) == 0:
        mes_arg, ano_arg = agora.month, agora.year
    elif len(args) == 2 and all(a.isdigit() for a in args):
        mes_arg, ano_arg = int(args[0]), int(args[1])
    else:
        await update.message.reply_text("Use: /extrato [mes ano]\nEx.: /extrato 9 2025")
        return

    itens, totais = cartao_bot.obter_extrato_consumo_usuario(user.id, mes_arg, ano_arg)
    # CORREÇÃO: Argumentos 'mes' e 'ano' renomeados para 'mes_referencia' e 'ano_referencia'
    texto = montar_texto_extrato(itens, totais, mes_referencia=mes_arg, ano_referencia=ano_arg, fatura_manager=cartao_bot.fatura_manager)
    await reply_long(update, texto, parse_mode="HTML")


# ===================== EXTRATO (HELPERS DE FORMATAÇÃO) =====================

MAX_TG = 3900

async def reply_long(update_or_query, texto, reply_markup=None, parse_mode="HTML"):
    partes = []
    parte_atual = []
    tamanho_atual = 0
    for linha in texto.split("\n"):
        linha_com_quebra = linha + "\n"
        if tamanho_atual + len(linha_com_quebra) > MAX_TG:
            partes.append("".join(parte_atual))
            parte_atual, tamanho_atual = [linha_com_quebra], len(linha_com_quebra)
        else:
            parte_atual.append(linha_com_quebra)
            tamanho_atual += len(linha_com_quebra)
    if parte_atual:
        partes.append("".join(parte_atual))

    is_callback = hasattr(update_or_query, "edit_message_text")
    chat = update_or_query.message.chat if is_callback else update_or_query.effective_chat

    if is_callback:
        await update_or_query.edit_message_text(partes[0], parse_mode=parse_mode, reply_markup=reply_markup)
        for parte in partes[1:]:
            await chat.send_message(parte, parse_mode=parse_mode)
    else:
        for idx, parte in enumerate(partes):
            await chat.send_message(parte, parse_mode=parse_mode, reply_markup=reply_markup if idx == 0 else None)


# ✅ Nomenclatura de variáveis melhorada e ajuste para não exibir pagamentos zerados
def montar_texto_extrato(itens: list, totais: dict, mes_referencia: int, ano_referencia: int, fatura_manager: Fatura):  # NOSONAR
    _ = fatura_manager
    def _fmt_valor_brl(valor_decimal):
        if not isinstance(valor_decimal, Decimal):
            try:
                valor_decimal = Decimal(str(valor_decimal))
            except Exception:
                valor_decimal = Decimal("0")
        return f"R$ {valor_decimal:.2f}".replace(".", ",")

    mes_exibicao = int(totais.get("mes_fatura", mes_referencia) or mes_referencia or 0)
    ano_exibicao = int(totais.get("ano_fatura", ano_referencia) or ano_referencia or 0)

    linhas = []
    # Altera o título para ser mais claro quando for uma fatura aberta
    if totais.get("pagamentos_mes", 0) > 0:
         titulo = f"📜 <b>Extrato Fechado {mes_exibicao:02d}/{ano_exibicao}</b>"
    else:
         titulo = f"🧾 <b>Fatura Aberta {mes_exibicao:02d}/{ano_exibicao}</b>"
    
    linhas.append(titulo + "\n")

    if not itens:
        linhas.append("Não há movimentações neste período.")
    else:
        for item in itens:
            data_item = to_naive_utc(item.get("data"))
            if not isinstance(data_item, datetime):
                data_item = datetime(ano_exibicao, mes_exibicao, 1) if mes_exibicao and ano_exibicao else datetime.now()
            
            data_str = data_item.strftime("%d/%m")
            descricao = (item.get("descricao") or "").strip() or "(sem descrição)"
            valor_str = _fmt_valor_brl(item.get("valor", 0))
            tipo_item = item.get("tipo")
            meta = item.get("meta") or {}

            if tipo_item in ["Parcela", "Gasto"]:
                num_parcela = meta.get("parcela_num")
                total_parcelas = meta.get("parcelas_total")
                marcador_parcela = f" ({num_parcela}/{int(total_parcelas)})" if num_parcela and total_parcelas else ""
                linhas.append(f"• {data_str} — {descricao}{marcador_parcela} — {valor_str}")
            else:
                linhas.append(f"• {data_str} — <b>{descricao}</b> — {valor_str}")

    linhas.append("\n<b>Totais do Período</b>")
    linhas.append(f"Gastos/Parcelas: {_fmt_valor_brl(totais.get('parcelas_mes', 0))}")
    
    # CORREÇÃO: Só exibe a linha de pagamentos se houver algum pagamento no período.
    pagamentos_do_periodo = totais.get('pagamentos_mes', 0)
    if pagamentos_do_periodo > 0:
        linhas.append(f"Pagamentos: -{_fmt_valor_brl(pagamentos_do_periodo)}")
    
    linhas.append(f"<b>Saldo do Período:</b> {_fmt_valor_brl(totais.get('saldo_mes', 0))}")

    return "\n".join(linhas)


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):  # NOSONAR
    err = context.error
    if isinstance(err, RetryAfter):
        logger.warning(f"Rate limit: esperar {err.retry_after}s")
        return
    if isinstance(err, (TimedOut, NetworkError)):
        logger.warning(f"Intermitência de rede/timeout: {err}")
        return
    logger.error("Erro não tratado", exc_info=err)
    if update:
        logger.error(f"Update problemático: {update}")


async def run_telegram_bot():
    """Função para configurar e iniciar o bot do Telegram"""
    global application
    if not BOT_TOKEN:
        logger.error("❌ ERRO: BOT_TOKEN não configurado!")
        print("❌ ERRO: Configure o BOT_TOKEN no arquivo .env ou nas variáveis de ambiente do Firebase Hosting/Functions.")
        print("📝 Obtenha seu token em: https://t.me/BotFather")
        return
    
    if not FIREBASE_PROJECT_ID:
        logger.error("❌ ERRO: FIREBASE_PROJECT_ID não configurado!")
        print("❌ ERRO: Configure o FIREBASE_PROJECT_ID no arquivo .env ou nas variáveis de ambiente definidas pelo Firebase.")
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

# A função main() original do usuário, agora renomeada para run_telegram_bot()
# e start_bot() para ser chamada pelo keep_alive.py

if __name__ == '__main__':
    # Para execução local direta (sem keep_alive.py)
    asyncio.run(run_telegram_bot())