#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import os
import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

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

# Configurar logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Estados para o modo de escuta
ESTADO_NORMAL = "normal"
ESTADO_AGUARDANDO_GASTO = "aguardando_gasto"
ESTADO_AGUARDANDO_PAGAMENTO = "aguardando_pagamento"
ESTADO_AGUARDANDO_CONSULTA_USUARIO = "aguardando_consulta_usuario"

class FirebaseCartaoCreditoBot:
    def __init__(self):
        self.db = self._inicializar_firebase()
        self._inicializar_configuracoes()
    
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
        ]
    ]
    
    # Adicionar opções de administrador se for admin
    if user_id == ADMIN_ID:
        keyboard.append([
            InlineKeyboardButton("👥 Relatório Geral", callback_data="menu_relatorio_geral"),
            InlineKeyboardButton("🔍 Consultar Usuário", callback_data="menu_consultar_usuario")
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

🎯 **Funcionalidades:**
• Registrar gastos com descrição e parcelas
• Acompanhar saldo devedor
• Registrar pagamentos
• Ver fatura mensal
• Histórico completo de gastos e pagamentos

🔒 **Privacidade:** Você só vê seus próprios dados.
☁️ **Dados seguros:** Armazenados no Firebase Cloud.

Use o menu abaixo para navegar:
    """
    
    keyboard = criar_menu_principal(user_id)
    await update.message.reply_text(welcome_message, reply_markup=keyboard)

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
        "💳 **Menu Principal**\n\nEscolha uma opção abaixo:",
        reply_markup=keyboard
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
            "💳 **Menu Principal**\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard
        )
    
    elif data == "cancelar_operacao":
        context.user_data['estado'] = ESTADO_NORMAL
        keyboard = criar_menu_principal(user_id)
        await query.edit_message_text(
            "❌ **Operação cancelada.**\n\n💳 **Menu Principal**\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard
        )
    
    elif data == "menu_adicionar_gasto":
        context.user_data['estado'] = ESTADO_AGUARDANDO_GASTO
        keyboard = criar_botao_cancelar()
        
        await query.edit_message_text(
            "💳 **Adicionar Gasto**\n\n"
            "Digite as informações do gasto no formato:\n"
            "`<descrição> <valor> [parcelas]`\n\n"
            "**Exemplos:**\n"
            "• `Almoço 25.50` - Gasto à vista\n"
            "• `Notebook 1200.00 12` - 12 parcelas de R$ 100,00\n"
            "• `Supermercado 89.90 1` - À vista (1 parcela)\n\n"
            "💡 **Dica:** Se não informar parcelas, será considerado à vista (1 parcela).\n\n"
            "✏️ **Aguardando sua mensagem...**",
            reply_markup=keyboard
        )
    
    elif data == "menu_pagamento":
        context.user_data['estado'] = ESTADO_AGUARDANDO_PAGAMENTO
        keyboard = criar_botao_cancelar()
        
        await query.edit_message_text(
            "💰 **Registrar Pagamento**\n\n"
            "Digite as informações do pagamento no formato:\n"
            "`<valor> [descrição]`\n\n"
            "**Exemplos:**\n"
            "• `150.00` - Pagamento simples\n"
            "• `200.50 Pagamento fatura março` - Com descrição\n\n"
            "💡 **Dica:** O pagamento será abatido do seu saldo devedor.\n\n"
            "✏️ **Aguardando sua mensagem...**",
            reply_markup=keyboard
        )
    
    elif data == "menu_consultar_usuario":
        if user_id != ADMIN_ID:
            await query.edit_message_text(
                "❌ **Acesso negado!**\n\n🔒 Apenas administradores podem consultar usuários.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
                ]])
            )
            return
        
        context.user_data['estado'] = ESTADO_AGUARDANDO_CONSULTA_USUARIO
        keyboard = criar_botao_cancelar()
        
        await query.edit_message_text(
            "🔍 **Consultar Usuário - Administrador**\n\n"
            "Digite o nome ou username do usuário que deseja consultar:\n\n"
            "**Exemplos:**\n"
            "• `João`\n"
            "• `@maria`\n"
            "• `pedro123`\n\n"
            "✏️ **Aguardando sua mensagem...**",
            reply_markup=keyboard
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
            f"{emoji} **{user_name}**, seu saldo atual:\n\n"
            f"📊 **{texto_status}**\n\n"
            f"Status: {status.title()}\n"
            f"☁️ Dados sincronizados com Firebase",
            reply_markup=keyboard
        )
    
    elif data == "menu_fatura_atual":
        mes_atual = datetime.now().month
        ano_atual = datetime.now().year
        valor_fatura, gastos_mes = cartao_bot.calcular_fatura_usuario(user_id, mes_atual, ano_atual)
        
        if valor_fatura > 0:
            texto_fatura = f"💳 **Fatura de {mes_atual:02d}/{ano_atual}**\n\n"
            texto_fatura += f"💰 **Total a pagar:** R$ {valor_fatura:.2f}\n\n"
            texto_fatura += f"📋 **Gastos do mês ({len(gastos_mes)} itens):**\n"
            
            for gasto in gastos_mes[:5]:  # Mostrar apenas os primeiros 5
                texto_fatura += f"• {gasto['descricao']}: R$ {gasto['valor_parcela']:.2f}\n"
            
            if len(gastos_mes) > 5:
                texto_fatura += f"... e mais {len(gastos_mes) - 5} itens.\n"
        else:
            texto_fatura = f"💳 **Fatura de {mes_atual:02d}/{ano_atual}**\n\n"
            texto_fatura += "✅ **Nenhum gasto neste mês!**"
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_fatura, reply_markup=keyboard)
    
    elif data == "menu_meus_gastos":
        gastos = cartao_bot.obter_gastos_usuario(user_id)
        
        if gastos:
            texto_gastos = f"📋 **Meus Gastos ({len(gastos)} itens)**\n\n"
            
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
                
                texto_gastos += f"• **{gasto['descricao']}**\n"
                texto_gastos += f"  💰 R$ {gasto['valor_total']:.2f} ({status_parcelas}x R$ {gasto['valor_parcela']:.2f})\n"
                texto_gastos += f"  📅 {data_compra}\n\n"
            
            if len(gastos) > 8:
                texto_gastos += f"... e mais {len(gastos) - 8} gastos."
        else:
            texto_gastos = "📋 **Meus Gastos**\n\n✅ Nenhum gasto registrado ainda."
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_gastos, reply_markup=keyboard)
    
    elif data == "menu_meus_pagamentos":
        pagamentos = cartao_bot.obter_pagamentos_usuario(user_id)
        
        if pagamentos:
            texto_pagamentos = f"💸 **Meus Pagamentos ({len(pagamentos)} itens)**\n\n"
            total_pagamentos = Decimal('0')
            
            for pagamento in pagamentos[:8]:  # Mostrar apenas os primeiros 8
                # Tratar data_pagamento que pode ser string ou datetime
                if isinstance(pagamento.get("data_pagamento"), datetime):
                    data_pagamento = pagamento["data_pagamento"].strftime("%d/%m/%y")
                else:
                    data_pagamento = datetime.fromisoformat(pagamento["data_pagamento"]).strftime("%d/%m/%y")
                
                descricao = pagamento.get('descricao', 'Pagamento')
                texto_pagamentos += f"• **R$ {pagamento['valor']:.2f}**\n"
                texto_pagamentos += f"  📝 {descricao}\n"
                texto_pagamentos += f"  📅 {data_pagamento}\n\n"
                total_pagamentos += pagamento['valor']
            
            if len(pagamentos) > 8:
                texto_pagamentos += f"... e mais {len(pagamentos) - 8} pagamentos.\n\n"
            
            texto_pagamentos += f"💰 **Total pago:** R$ {total_pagamentos:.2f}"
        else:
            texto_pagamentos = "💸 **Meus Pagamentos**\n\n✅ Nenhum pagamento registrado ainda."
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_pagamentos, reply_markup=keyboard)
    
    elif data == "menu_relatorio_geral":
        if user_id != ADMIN_ID:
            await query.edit_message_text(
                "❌ **Acesso negado!**\n\n🔒 Apenas administradores podem acessar relatórios gerais.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
                ]])
            )
            return
        
        relatorio = cartao_bot.obter_relatorio_completo()
        
        texto_relatorio = "👥 **Relatório Geral - Administrador**\n\n"
        texto_relatorio += f"💳 **Total em gastos:** R$ {relatorio['total_gastos']:.2f}\n"
        texto_relatorio += f"💰 **Total em pagamentos:** R$ {relatorio['total_pagamentos']:.2f}\n"
        texto_relatorio += f"📊 **Saldo geral:** R$ {relatorio['saldo_geral']:.2f}\n\n"
        texto_relatorio += f"👥 **Usuários ({len(relatorio['usuarios'])}):**\n"
        
        for usuario in relatorio['usuarios'][:10]:  # Mostrar apenas os primeiros 10
            nome = usuario['name']
            saldo = usuario['saldo']
            emoji_saldo = "🔴" if saldo > 0 else "💚" if saldo < 0 else "⚖️"
            texto_relatorio += f"{emoji_saldo} **{nome}:** R$ {saldo:.2f}\n"
        
        if len(relatorio['usuarios']) > 10:
            texto_relatorio += f"... e mais {len(relatorio['usuarios']) - 10} usuários."
        
        texto_relatorio += f"\n☁️ Dados do Firebase Firestore"
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_relatorio, reply_markup=keyboard)
    
    elif data == "menu_ajuda":
        ajuda_text = """
❓ **Ajuda - Bot de Cartão de Crédito**

**🎛️ Interface Otimizada:**
• Clique nos botões do menu para ações rápidas
• Após clicar, digite apenas as informações solicitadas
• Não precisa repetir comandos após usar os botões

**📋 Comandos principais:**
• `/gasto <desc> <valor> [parcelas]` - Registrar gasto
• `/pagamento <valor> [desc]` - Registrar pagamento
• `/saldo` - Ver saldo atual
• `/fatura` - Ver fatura do mês
• `/gastos` - Ver histórico de gastos
• `/pagamentos` - Ver histórico de pagamentos

**💡 Como funciona:**
• Registre seus gastos com descrição e parcelas
• O bot calcula automaticamente as parcelas mensais
• Registre seus pagamentos para abater da dívida
• Acompanhe seu saldo devedor em tempo real

**🔒 Privacidade:**
• Você só vê seus próprios dados
• Administrador tem acesso a relatórios gerais

**☁️ Firebase:**
• Dados armazenados com segurança na nuvem
• Sincronização automática
• Backup e recuperação garantidos

**📅 Parcelas:**
• O bot controla automaticamente as parcelas
• Cada mês, a parcela correspondente é adicionada à fatura
• Gastos parcelados são distribuídos ao longo dos meses
        """
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(ajuda_text, reply_markup=keyboard)

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
    else:
        # Estado normal - mostrar menu
        keyboard = criar_menu_principal(user_id)
        await update.message.reply_text(
            "💳 **Menu Principal**\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard
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
                "❌ **Formato incorreto!**\n\n"
                "Use: `<descrição> <valor> [parcelas]`\n\n"
                "**Exemplos:** `Almoço 25.50` ou `Notebook 1200.00 12`",
                reply_markup=criar_botao_cancelar()
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
                "❌ **Valor deve ser maior que zero!**",
                reply_markup=criar_botao_cancelar()
            )
            return
        
        if parcelas > 60:
            await update.message.reply_text(
                "❌ **Máximo de 60 parcelas permitido!**",
                reply_markup=criar_botao_cancelar()
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
                f"✅ **Gasto registrado com sucesso!**\n\n"
                f"📝 **Descrição:** {descricao}\n"
                f"💰 **Valor:** R$ {valor:.2f} (à vista)\n"
                f"📅 **Data:** {datetime.now().strftime('%d/%m/%Y')}\n"
                f"☁️ **Salvo no Firebase**"
            )
        else:
            texto_confirmacao = (
                f"✅ **Gasto registrado com sucesso!**\n\n"
                f"📝 **Descrição:** {descricao}\n"
                f"💰 **Valor total:** R$ {valor:.2f}\n"
                f"📊 **Parcelas:** {parcelas}x R$ {valor_parcela:.2f}\n"
                f"📅 **Data:** {datetime.now().strftime('%d/%m/%Y')}\n"
                f"☁️ **Salvo no Firebase**"
            )
        
        await update.message.reply_text(texto_confirmacao, reply_markup=keyboard)
        
    except (InvalidOperation, ValueError):
        await update.message.reply_text(
            "❌ **Erro nos dados informados!**\n\n"
            "Verifique se o valor está correto e as parcelas são um número inteiro.\n\n"
            "**Formato:** `<descrição> <valor> [parcelas]`",
            reply_markup=criar_botao_cancelar()
        )
    except Exception as e:
        logger.error(f"Erro ao processar gasto: {e}")
        await update.message.reply_text(
            "❌ **Erro interno!**\n\n"
            "Tente novamente em alguns instantes.",
            reply_markup=criar_botao_cancelar()
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
                "❌ **Formato incorreto!**\n\n"
                "Use: `<valor> [descrição]`\n\n"
                "**Exemplo:** `150.00` ou `200.50 Pagamento fatura março`",
                reply_markup=criar_botao_cancelar()
            )
            return
        
        # Extrair valor (primeiro elemento)
        valor_str = partes[0]
        valor = Decimal(valor_str.replace(',', '.'))
        
        # Extrair descrição (resto dos elementos)
        descricao = " ".join(partes[1:]) if len(partes) > 1 else "Pagamento"
        
        if valor <= 0:
            await update.message.reply_text(
                "❌ **Valor deve ser maior que zero!**",
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
            f"✅ **Pagamento registrado com sucesso!**\n\n"
            f"💰 **Valor pago:** R$ {valor:.2f}\n"
            f"📝 **Descrição:** {descricao}\n"
            f"📅 **Data:** {datetime.now().strftime('%d/%m/%Y')}\n\n"
            f"{emoji_saldo} **{texto_saldo}**\n"
            f"☁️ **Salvo no Firebase**"
        )
        
        await update.message.reply_text(texto_confirmacao, reply_markup=keyboard)
        
    except (InvalidOperation, ValueError):
        await update.message.reply_text(
            "❌ **Valor inválido!**\n\n"
            "Use apenas números.\n\n"
            "**Exemplos válidos:**\n"
            "• `100`\n"
            "• `150.50`",
            reply_markup=criar_botao_cancelar()
        )
    except Exception as e:
        logger.error(f"Erro ao processar pagamento: {e}")
        await update.message.reply_text(
            "❌ **Erro interno!**\n\n"
            "Tente novamente em alguns instantes.",
            reply_markup=criar_botao_cancelar()
        )

async def processar_consulta_usuario(update: Update, context: ContextTypes.DEFAULT_TYPE, texto: str):
    """Processa consulta de usuário (apenas admin)"""
    user_id = update.effective_user.id
    
    if user_id != ADMIN_ID:
        context.user_data['estado'] = ESTADO_NORMAL
        await update.message.reply_text(
            "❌ **Acesso negado!**",
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
            
            # Obter dados detalhados
            gastos = cartao_bot.obter_gastos_usuario(user_id_consultado)
            pagamentos = cartao_bot.obter_pagamentos_usuario(user_id_consultado)
            valor_fatura, gastos_mes = cartao_bot.calcular_fatura_usuario(user_id_consultado)
            
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
            
            texto_consulta = f"🔍 **Consulta de Usuário - Admin**\n\n"
            texto_consulta += f"👤 **Nome:** {nome}\n"
            texto_consulta += f"📱 **Username:** @{username}\n"
            texto_consulta += f"{emoji_saldo} **Saldo:** {status_saldo}\n"
            texto_consulta += f"💳 **Fatura atual:** R$ {valor_fatura:.2f}\n"
            texto_consulta += f"📋 **Total de gastos:** {len(gastos)}\n"
            texto_consulta += f"💸 **Total de pagamentos:** {len(pagamentos)}\n"
            texto_consulta += f"☁️ **Dados do Firebase**"
            
            await update.message.reply_text(texto_consulta, reply_markup=keyboard)
        else:
            await update.message.reply_text(
                f"❌ **Usuário não encontrado!**\n\n"
                f"Nenhum usuário encontrado com o termo: `{texto}`\n\n"
                f"Tente buscar por nome ou username.",
                reply_markup=keyboard
            )
    except Exception as e:
        logger.error(f"Erro ao consultar usuário: {e}")
        await update.message.reply_text(
            "❌ **Erro interno!**\n\n"
            "Tente novamente em alguns instantes.",
            reply_markup=keyboard
        )

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
            "❌ **Uso incorreto!**\n\n"
            "**Formato:** `/gasto <descrição> <valor> [parcelas]`\n\n"
            "**Exemplos:**\n"
            "• `/gasto Almoço 25.50`\n"
            "• `/gasto Notebook 1200.00 12`\n\n"
            "💡 **Dica:** Use o menu otimizado para uma experiência melhor!",
            reply_markup=keyboard
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
            "❌ **Uso incorreto!**\n\n"
            "**Formato:** `/pagamento <valor> [descrição]`\n\n"
            "**Exemplos:**\n"
            "• `/pagamento 150.00`\n"
            "• `/pagamento 200.50 Pagamento fatura março`\n\n"
            "💡 **Dica:** Use o menu otimizado para uma experiência melhor!",
            reply_markup=keyboard
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
        f"{emoji} **{user_name}**, seu saldo atual:\n\n"
        f"📊 **{texto_status}**\n\n"
        f"Status: {status.title()}\n"
        f"☁️ Dados sincronizados com Firebase",
        reply_markup=keyboard
    )

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Manipula erros"""
    logger.error(f"Erro: {context.error}")

async def run_telegram_bot():
    """Função para configurar e iniciar o bot do Telegram"""
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
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Configurar menu de comandos assim que iniciar
    application.post_init = lambda app: app.create_task(configurar_menu_comandos(app))
    
    # Adicionar handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("menu", menu))
    application.add_handler(CommandHandler("gasto", gasto))
    application.add_handler(CommandHandler("pagamento", pagamento))
    application.add_handler(CommandHandler("saldo", saldo))
    
    # Adicionar handler para callbacks dos botões
    application.add_handler(CallbackQueryHandler(callback_handler))
    
    # Adicionar handler para mensagens de texto (modo de escuta)
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, processar_mensagem_texto))
    
    # Adicionar handler de erro
    application.add_error_handler(error_handler)
    
    logger.info("💳 Bot de Controle de Cartão de Crédito com Firebase iniciado!")
    logger.info("📱 Interface otimizada ativa!")
    logger.info("☁️ Dados armazenados no Firebase Firestore!")
    
    # Iniciar o polling de forma não bloqueante
    await application.initialize()
    await application.start()
    await application.updater.start_polling(drop_pending_updates=True, poll_interval=1.0, allowed_updates=Update.ALL_TYPES)
    logger.info("Bot Telegram polling iniciado.")
    
    # Manter o loop de eventos rodando para o polling
    await application.updater.idle()

async def start_bot():
    """Função para iniciar o bot (usada pelo keep_alive.py para rodar em background)"""
    asyncio.create_task(run_telegram_bot())

# A função main() original do usuário, agora renomeada para run_telegram_bot()
# e start_bot() para ser chamada pelo keep_alive.py

if __name__ == '__main__':
    # Para execução local direta (sem keep_alive.py)
    asyncio.run(run_telegram_bot())

