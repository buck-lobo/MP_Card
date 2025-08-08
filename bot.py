#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import os
import logging
import time
from decimal import Decimal, InvalidOperation
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand, ForceReply
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters
from config import BOT_TOKEN, ADMIN_ID, DATA_FILE

# Configurar logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class SaldoBotGrupos:
    def __init__(self):
        self.data_file = DATA_FILE
        self.dados = self.carregar_dados()
        self.transacoes_pendentes = {}  # Para confirmações de transações
    
    def carregar_dados(self):
        """Carrega os dados do arquivo JSON"""
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Converter strings de volta para Decimal nos saldos
                    for chat_id in data.get('saldos', {}):
                        for user_id in data['saldos'][chat_id]:
                            data['saldos'][chat_id][user_id] = Decimal(data['saldos'][chat_id][user_id])
                    return data
            except (json.JSONDecodeError, FileNotFoundError):
                logger.warning("Erro ao carregar dados. Iniciando com dados zerados.")
                return {"saldos": {}, "usuarios": {}}
        return {"saldos": {}, "usuarios": {}}
    
    def salvar_dados(self):
        """Salva os dados no arquivo JSON"""
        try:
            # Converter Decimal para string para serialização JSON
            data_to_save = {"saldos": {}, "usuarios": self.dados.get("usuarios", {})}
            for chat_id in self.dados.get('saldos', {}):
                data_to_save['saldos'][chat_id] = {}
                for user_id in self.dados['saldos'][chat_id]:
                    data_to_save['saldos'][chat_id][user_id] = str(self.dados['saldos'][chat_id][user_id])
            
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(data_to_save, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Erro ao salvar dados: {e}")
    
    def registrar_usuario(self, user_id, user_name, username=None):
        """Registra informações do usuário"""
        if "usuarios" not in self.dados:
            self.dados["usuarios"] = {}
        
        self.dados["usuarios"][str(user_id)] = {
            "name": user_name,
            "username": username,
            "last_seen": int(time.time())
        }
        self.salvar_dados()
    
    def obter_saldo(self, chat_id, user_id):
        """Obtém o saldo de um usuário em um chat específico"""
        chat_id_str = str(chat_id)
        user_id_str = str(user_id)
        
        if "saldos" not in self.dados:
            self.dados["saldos"] = {}
        
        if chat_id_str not in self.dados["saldos"]:
            self.dados["saldos"][chat_id_str] = {}
        
        return self.dados["saldos"][chat_id_str].get(user_id_str, Decimal('0'))
    
    def adicionar_valor(self, chat_id, user_id, valor):
        """Adiciona um valor ao saldo do usuário em um chat específico"""
        chat_id_str = str(chat_id)
        user_id_str = str(user_id)
        
        if "saldos" not in self.dados:
            self.dados["saldos"] = {}
        
        if chat_id_str not in self.dados["saldos"]:
            self.dados["saldos"][chat_id_str] = {}
        
        if user_id_str not in self.dados["saldos"][chat_id_str]:
            self.dados["saldos"][chat_id_str][user_id_str] = Decimal('0')
        
        self.dados["saldos"][chat_id_str][user_id_str] += valor
        self.salvar_dados()
    
    def zerar_saldo(self, chat_id, user_id):
        """Zera o saldo de um usuário em um chat específico"""
        chat_id_str = str(chat_id)
        user_id_str = str(user_id)
        
        if "saldos" not in self.dados:
            self.dados["saldos"] = {}
        
        if chat_id_str not in self.dados["saldos"]:
            self.dados["saldos"][chat_id_str] = {}
        
        self.dados["saldos"][chat_id_str][user_id_str] = Decimal('0')
        self.salvar_dados()
    
    def zerar_todos_saldos(self, chat_id):
        """Zera todos os saldos de um chat específico"""
        chat_id_str = str(chat_id)
        
        if "saldos" not in self.dados:
            self.dados["saldos"] = {}
        
        self.dados["saldos"][chat_id_str] = {}
        self.salvar_dados()
    
    def obter_info_usuario(self, user_id):
        """Obtém informações de um usuário"""
        return self.dados.get("usuarios", {}).get(str(user_id), None)
    
    def listar_usuarios_chat(self, chat_id):
        """Lista usuários que já interagiram no chat"""
        chat_id_str = str(chat_id)
        usuarios_chat = []
        
        if "saldos" in self.dados and chat_id_str in self.dados["saldos"]:
            for user_id in self.dados["saldos"][chat_id_str]:
                info_usuario = self.obter_info_usuario(user_id)
                if info_usuario:
                    usuarios_chat.append({
                        "id": user_id,
                        "name": info_usuario["name"],
                        "username": info_usuario.get("username"),
                        "saldo": self.dados["saldos"][chat_id_str][user_id]
                    })
        
        return usuarios_chat

# Instância global do bot
saldo_bot = SaldoBotGrupos()

def criar_menu_principal(user_id, chat_type):
    """Cria o teclado do menu principal"""
    keyboard = [
        [
            InlineKeyboardButton("💰 Adicionar Valor", callback_data="menu_adicionar"),
            InlineKeyboardButton("📊 Ver Saldo", callback_data="menu_saldo")
        ]
    ]
    
    # Adicionar opções específicas para grupos
    if chat_type in ['group', 'supergroup']:
        keyboard.append([
            InlineKeyboardButton("👥 Saldos do Grupo", callback_data="menu_saldos_grupo"),
            InlineKeyboardButton("💸 Transferir", callback_data="menu_transferir")
        ])
    
    # Adicionar opções de administrador se for admin
    if user_id == ADMIN_ID:
        if chat_type in ['group', 'supergroup']:
            keyboard.append([
                InlineKeyboardButton("🔄 Zerar Meu Saldo", callback_data="menu_zerar_proprio"),
                InlineKeyboardButton("🗑️ Zerar Grupo", callback_data="menu_zerar_todos")
            ])
        else:
            keyboard.append([
                InlineKeyboardButton("🔄 Zerar Meu Saldo", callback_data="menu_zerar_proprio"),
                InlineKeyboardButton("🗑️ Zerar Todos", callback_data="menu_zerar_todos")
            ])
    
    keyboard.append([InlineKeyboardButton("❓ Ajuda", callback_data="menu_ajuda")])
    
    return InlineKeyboardMarkup(keyboard)

def criar_menu_usuarios(chat_id, acao="transferir"):
    """Cria menu com lista de usuários do grupo"""
    usuarios = saldo_bot.listar_usuarios_chat(chat_id)
    keyboard = []
    
    for usuario in usuarios[:10]:  # Limitar a 10 usuários por página
        nome = usuario["name"]
        username = f"@{usuario['username']}" if usuario.get("username") else ""
        saldo = usuario["saldo"]
        
        texto_botao = f"{nome} {username} (R$ {saldo:.2f})"
        if len(texto_botao) > 30:
            texto_botao = f"{nome[:15]}... (R$ {saldo:.2f})"
        
        callback_data = f"{acao}_{usuario['id']}"
        keyboard.append([InlineKeyboardButton(texto_botao, callback_data=callback_data)])
    
    if not usuarios:
        keyboard.append([InlineKeyboardButton("Nenhum usuário encontrado", callback_data="noop")])
    
    keyboard.append([InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")])
    return InlineKeyboardMarkup(keyboard)

async def configurar_menu_comandos(application):
    """Configura o menu de comandos do bot"""
    comandos = [
        BotCommand("start", "Iniciar o bot e ver menu principal"),
        BotCommand("menu", "Abrir menu interativo"),
        BotCommand("soma", "Adicionar valor ao saldo (ex: /soma 10.50)"),
        BotCommand("saldo", "Ver saldo atual"),
        BotCommand("transferir", "Transferir valor para outro usuário"),
        BotCommand("saldos", "Ver saldos do grupo (apenas em grupos)"),
        BotCommand("ajuda", "Ver ajuda e comandos disponíveis")
    ]
    
    # Adicionar comandos de admin se necessário
    if ADMIN_ID:
        comandos.append(BotCommand("zerar", "Zerar saldo (apenas administradores)"))
    
    await application.bot.set_my_commands(comandos)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /start - Apresenta o bot com menu interativo"""
    user = update.effective_user
    chat = update.effective_chat
    user_id = user.id
    chat_type = chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(user_id, user.first_name, user.username)
    
    if chat_type in ['group', 'supergroup']:
        welcome_message = f"""
🤖 Olá {user.first_name}! Bot de Saldo ativo no grupo!

💡 **Funcionalidades em grupos:**
• Saldos individuais por usuário
• Transferências entre membros
• Visualização de saldos do grupo
• Confirmação para transações

Use o menu abaixo ou digite os comandos diretamente.
        """
    else:
        welcome_message = f"""
🤖 Olá {user.first_name}! Bem-vindo ao Bot de Saldo!

Use o menu abaixo para navegar pelas funcionalidades ou digite os comandos diretamente:

💡 **Dica:** Clique nos botões abaixo para uma experiência mais fácil!
        """
    
    keyboard = criar_menu_principal(user_id, chat_type)
    await update.message.reply_text(welcome_message, reply_markup=keyboard)

async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /menu - Mostra o menu interativo"""
    user_id = update.effective_user.id
    chat_type = update.effective_chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(update.effective_user.id, update.effective_user.first_name, update.effective_user.username)
    
    keyboard = criar_menu_principal(user_id, chat_type)
    
    await update.message.reply_text(
        "📋 **Menu Principal**\n\nEscolha uma opção abaixo:",
        reply_markup=keyboard
    )

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Manipula os callbacks dos botões inline"""
    query = update.callback_query
    user_id = query.from_user.id
    user_name = query.from_user.first_name
    chat_id = query.message.chat_id
    chat_type = query.message.chat.type
    data = query.data
    
    await query.answer()  # Confirma o clique do botão
    
    # Registrar usuário
    saldo_bot.registrar_usuario(user_id, user_name, query.from_user.username)
    
    if data == "menu_principal":
        keyboard = criar_menu_principal(user_id, chat_type)
        await query.edit_message_text(
            "📋 **Menu Principal**\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard
        )
    
    elif data == "menu_adicionar":
        await query.message.reply_text(
            "💰 **Adicionar/Remover Valor**:\n\n💬 Digite o valor desejado (ex: `25.50` ou `-10.00`).",
            reply_markup=ForceReply(selective=True)
        )
    
    elif data == "menu_saldo":
        saldo_atual = saldo_bot.obter_saldo(chat_id, user_id)
        
        if saldo_atual >= 0:
            emoji = "💰"
            status = "positivo"
        else:
            emoji = "🔴"
            status = "negativo"
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        contexto = ""
        if chat_type in ['group', 'supergroup']:
            contexto = f" neste grupo"
        
        await query.edit_message_text(
            f"{emoji} **{user_name}**, seu saldo{contexto} é:\n\n"
            f"📊 **R$ {saldo_atual:.2f}** ({status})",
            reply_markup=keyboard
        )
    
    elif data == "menu_saldos_grupo":
        if chat_type not in ['group', 'supergroup']:
            keyboard = InlineKeyboardMarkup([[
                InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
            ]])
            await query.edit_message_text(
                "❌ Esta função está disponível apenas em grupos!",
                reply_markup=keyboard
            )
            return
        
        usuarios = saldo_bot.listar_usuarios_chat(chat_id)
        
        if not usuarios:
            keyboard = InlineKeyboardMarkup([[
                InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
            ]])
            await query.edit_message_text(
                "📊 **Saldos do Grupo**\n\nNenhum usuário com saldo registrado ainda.",
                reply_markup=keyboard
            )
            return
        
        texto_saldos = "📊 **Saldos do Grupo**\n\n"
        for usuario in usuarios[:10]:  # Limitar a 10 usuários
            nome = usuario["name"]
            username = f" (@{usuario['username']})" if usuario.get("username") else ""
            saldo = usuario["saldo"]
            emoji_saldo = "💰" if saldo >= 0 else "🔴"
            texto_saldos += f"{emoji_saldo} **{nome}**{username}: R$ {saldo:.2f}\n"
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_saldos, reply_markup=keyboard)
    
    elif data == "menu_transferir":
        if chat_type not in ['group', 'supergroup']:
            keyboard = InlineKeyboardMarkup([[
                InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
            ]])
            await query.edit_message_text(
                "❌ Transferências estão disponíveis apenas em grupos!",
                reply_markup=keyboard
            )
            return
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("💬 Usar Comando", callback_data="transferir_comando"),
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(
            "💸 **Transferir Valor**\n\n"
            "Para transferir, use o comando:\n"
            "`/transferir @usuario valor`\n\n"
            "**Exemplo:**\n"
            "`/transferir @joao 25.50`\n\n"
            "💡 O usuário receberá uma solicitação de confirmação.",
            reply_markup=keyboard
        )
    
    elif data == "transferir_comando":
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_transferir")
        ]])
        
        await query.edit_message_text(
            "💬 **Como transferir:**\n\n"
            "Digite: `/transferir @usuario valor`\n\n"
            "**Exemplos:**\n"
            "• `/transferir @maria 10.50`\n"
            "• `/transferir @joao 25`\n"
            "• `/transferir @ana -5.25` (para receber)\n\n"
            "⚠️ **Importante:** O usuário deve confirmar a transação!",
            reply_markup=keyboard
        )
    
    elif data == "menu_ajuda":
        if chat_type in ['group', 'supergroup']:
            ajuda_text = """
❓ **Ajuda - Bot em Grupos**

**📋 Comandos disponíveis:**
• `/start` - Inicia o bot e mostra o menu
• `/menu` - Abre o menu interativo
• `/soma <valor>` - Adiciona valor ao seu saldo
• `/saldo` - Mostra seu saldo no grupo
• `/saldos` - Mostra saldos de todos no grupo
• `/transferir @usuario valor` - Transfere valor
• `/ajuda` - Mostra esta ajuda

**💡 Funcionalidades em grupos:**
• Cada usuário tem saldo individual
• Transferências precisam de confirmação
• Administradores podem zerar saldos
• Dados salvos por grupo

**🔒 Comandos de Administrador:**
• `/zerar` - Zera seu saldo
• `/zerar tudo` - Zera saldos do grupo
            """
        else:
            ajuda_text = """
❓ **Ajuda - Como usar o bot**

**📋 Comandos disponíveis:**
• `/start` - Inicia o bot e mostra o menu
• `/menu` - Abre o menu interativo
• `/soma <valor>` - Adiciona valor (ex: /soma 15.50)
• `/saldo` - Mostra seu saldo atual
• `/ajuda` - Mostra esta ajuda

**💡 Dicas:**
• Use valores negativos para subtrair (ex: /soma -10)
• O menu interativo facilita o uso
• Seus dados são salvos automaticamente

**🔒 Comandos de Administrador:**
• `/zerar` - Zera seu saldo
• `/zerar tudo` - Zera todos os saldos
            """
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(ajuda_text, reply_markup=keyboard)
    
    elif data == "menu_zerar_proprio":
        if user_id != ADMIN_ID:
            await query.edit_message_text(
                "❌ **Acesso negado!**\n\n🔒 Apenas administradores podem usar esta função.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
                ]])
            )
            return
        
        saldo_bot.zerar_saldo(chat_id, user_id)
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        contexto = ""
        if chat_type in ['group', 'supergroup']:
            contexto = " neste grupo"
        
        await query.edit_message_text(
            f"🔄 **{user_name}**, seu saldo{contexto} foi zerado!\n\n📊 **Saldo atual:** R$ 0,00",
            reply_markup=keyboard
        )
    
    elif data == "menu_zerar_todos":
        if user_id != ADMIN_ID:
            await query.edit_message_text(
                "❌ **Acesso negado!**\n\n🔒 Apenas administradores podem usar esta função.",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
                ]])
            )
            return
        
        if chat_type in ['group', 'supergroup']:
            saldo_bot.zerar_todos_saldos(chat_id)
            mensagem = "🔄 **Administrador**, todos os saldos do grupo foram zerados!\n\n✅ Grupo reiniciado com sucesso."
        else:
            saldo_bot.zerar_todos_saldos(chat_id)
            mensagem = "🔄 **Administrador**, todos os saldos foram zerados!\n\n✅ Sistema reiniciado com sucesso."
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(mensagem, reply_markup=keyboard)
    
    elif data.startswith("valor_"):
        try:
            valor_str = data.replace("valor_", "")
            valor = Decimal(valor_str)
            
            saldo_bot.adicionar_valor(chat_id, user_id, valor)
            novo_saldo = saldo_bot.obter_saldo(chat_id, user_id)
            
            if valor >= 0:
                emoji = "➕"
                acao = "adicionado"
            else:
                emoji = "➖"
                acao = "subtraído"
            
            keyboard = InlineKeyboardMarkup([
                [InlineKeyboardButton("💰 Adicionar Mais", callback_data="menu_adicionar")],
                [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
            ])
            
            contexto = ""
            if chat_type in ['group', 'supergroup']:
                contexto = " no grupo"
            
            await query.edit_message_text(
                f"{emoji} **{user_name}**, valor {acao} com sucesso{contexto}!\n\n"
                f"💰 **Valor {acao}:** R$ {abs(valor):.2f}\n"
                f"📊 **Saldo atual:** R$ {novo_saldo:.2f}",
                reply_markup=keyboard
            )
            
        except (InvalidOperation, ValueError):
            keyboard = InlineKeyboardMarkup([[
                InlineKeyboardButton("🔙 Voltar", callback_data="menu_adicionar")
            ]])
            
            await query.edit_message_text(
                "❌ Erro interno. Tente novamente.",
                reply_markup=keyboard
            )
    
    elif data.startswith("confirmar_") or data.startswith("rejeitar_"):
        # Processar confirmações de transferência
        await processar_confirmacao_transferencia(update, context, data)
    
    elif data == "noop":
        # Não fazer nada (botão desabilitado)
        pass

async def processar_confirmacao_transferencia(update: Update, context: ContextTypes.DEFAULT_TYPE, data: str):
    """Processa confirmação ou rejeição de transferência"""
    query = update.callback_query
    user_id = query.from_user.id
    chat_id = query.message.chat_id
    
    # Extrair ID da transação
    parts = data.split("_")
    acao = parts[0]  # "confirmar" ou "rejeitar"
    transacao_id = "_".join(parts[1:])
    
    if transacao_id not in saldo_bot.transacoes_pendentes:
        await query.edit_message_text(
            "❌ **Transação expirada ou inválida.**\n\n"
            "Esta solicitação não é mais válida."
        )
        return
    
    transacao = saldo_bot.transacoes_pendentes[transacao_id]
    
    # Verificar se é o destinatário correto
    if user_id != transacao["destinatario_id"]:
        await query.answer("❌ Você não pode responder a esta transação.", show_alert=True)
        return
    
    if acao == "confirmar":
        # Executar a transferência
        valor = transacao["valor"]
        remetente_id = transacao["remetente_id"]
        remetente_nome = transacao["remetente_nome"]
        destinatario_nome = transacao["destinatario_nome"]
        
        # Verificar se remetente tem saldo suficiente (se for valor positivo)
        if valor > 0:
            saldo_remetente = saldo_bot.obter_saldo(chat_id, remetente_id)
            if saldo_remetente < valor:
                await query.edit_message_text(
                    f"❌ **Transação cancelada!**\n\n"
                    f"**{remetente_nome}** não possui saldo suficiente.\n"
                    f"Saldo atual: R$ {saldo_remetente:.2f}\n"
                    f"Valor solicitado: R$ {valor:.2f}"
                )
                del saldo_bot.transacoes_pendentes[transacao_id]
                return
        
        # Executar transferência
        saldo_bot.adicionar_valor(chat_id, remetente_id, -valor)
        saldo_bot.adicionar_valor(chat_id, user_id, valor)
        
        novo_saldo_remetente = saldo_bot.obter_saldo(chat_id, remetente_id)
        novo_saldo_destinatario = saldo_bot.obter_saldo(chat_id, user_id)
        
        await query.edit_message_text(
            f"✅ **Transferência confirmada!**\n\n"
            f"💸 **{remetente_nome}** → **{destinatario_nome}**\n"
            f"💰 **Valor:** R$ {valor:.2f}\n\n"
            f"📊 **Novos saldos:**\n"
            f"• **{remetente_nome}:** R$ {novo_saldo_remetente:.2f}\n"
            f"• **{destinatario_nome}:** R$ {novo_saldo_destinatario:.2f}"
        )
        
        # Notificar o remetente
        try:
            await context.bot.send_message(
                chat_id=remetente_id,
                text=f"✅ **Transferência confirmada por {destinatario_nome}!**\n\n"
                     f"💰 **Valor:** R$ {valor:.2f}\n"
                     f"📊 **Seu novo saldo:** R$ {novo_saldo_remetente:.2f}"
            )
        except:
            pass  # Usuário pode ter bloqueado o bot
    
    else:  # rejeitar
        remetente_nome = transacao["remetente_nome"]
        destinatario_nome = transacao["destinatario_nome"]
        valor = transacao["valor"]
        
        await query.edit_message_text(
            f"❌ **Transferência rejeitada!**\n\n"
            f"**{destinatario_nome}** rejeitou a transferência de R$ {valor:.2f} de **{remetente_nome}**."
        )
        
        # Notificar o remetente
        try:
            await context.bot.send_message(
                chat_id=transacao["remetente_id"],
                text=f"❌ **Transferência rejeitada!**\n\n"
                     f"**{destinatario_nome}** rejeitou sua transferência de R$ {valor:.2f}."
            )
        except:
            pass  # Usuário pode ter bloqueado o bot
    
    # Remover transação pendente
    del saldo_bot.transacoes_pendentes[transacao_id]

async def transferir(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /transferir - Transfere valor para outro usuário"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    chat_id = update.effective_chat.id
    chat_type = update.effective_chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    if chat_type not in ['group', 'supergroup']:
        await update.message.reply_text(
            "❌ **Transferências estão disponíveis apenas em grupos!**\n\n"
            "Adicione o bot a um grupo para usar esta funcionalidade."
        )
        return
    
    if len(context.args) < 2:
        await update.message.reply_text(
            "❌ **Uso incorreto!**\n\n"
            "**Formato:** `/transferir @usuario valor`\n\n"
            "**Exemplos:**\n"
            "• `/transferir @maria 10.50`\n"
            "• `/transferir @joao 25`"
        )
        return
    
    try:
        destinatario_username = context.args[0].replace('@', '').lower()
        valor_str = context.args[1].replace(',', '.')
        valor = Decimal(valor_str)
        
        if valor == 0:
            await update.message.reply_text("❌ **Valor deve ser diferente de zero!**")
            return
        
        # Procurar usuário pelo username
        destinatario_id = None
        destinatario_nome = None
        
        for user_id_str, info in saldo_bot.dados.get("usuarios", {}).items():
            if info.get("username", "").lower() == destinatario_username:
                destinatario_id = int(user_id_str)
                destinatario_nome = info["name"]
                break
        
        if not destinatario_id:
            await update.message.reply_text(
                f"❌ **Usuário @{destinatario_username} não encontrado!**\n\n"
                "O usuário deve ter interagido com o bot pelo menos uma vez."
            )
            return
        
        if destinatario_id == user_id:
            await update.message.reply_text("❌ **Você não pode transferir para si mesmo!**")
            return
        
        # Verificar se remetente tem saldo suficiente (se for valor positivo)
        if valor > 0:
            saldo_remetente = saldo_bot.obter_saldo(chat_id, user_id)
            if saldo_remetente < valor:
                await update.message.reply_text(
                    f"❌ **Saldo insuficiente!**\n\n"
                    f"💰 **Seu saldo:** R$ {saldo_remetente:.2f}\n"
                    f"💸 **Valor solicitado:** R$ {valor:.2f}"
                )
                return
        
        # Criar transação pendente
        transacao_id = f"{user_id}_{destinatario_id}_{int(time.time())}"
        saldo_bot.transacoes_pendentes[transacao_id] = {
            "remetente_id": user_id,
            "remetente_nome": user_name,
            "destinatario_id": destinatario_id,
            "destinatario_nome": destinatario_nome,
            "valor": valor,
            "chat_id": chat_id,
            "timestamp": time.time()
        }
        
        # Criar botões de confirmação
        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Confirmar", callback_data=f"confirmar_{transacao_id}"),
                InlineKeyboardButton("❌ Rejeitar", callback_data=f"rejeitar_{transacao_id}")
            ]
        ])
        
        # Enviar solicitação de confirmação
        if valor > 0:
            tipo_transacao = "transferir"
            emoji = "💸"
        else:
            tipo_transacao = "receber"
            emoji = "💰"
            valor = abs(valor)
        
        await update.message.reply_text(
            f"{emoji} **Solicitação de Transferência**\n\n"
            f"**{user_name}** quer {tipo_transacao} **R$ {valor:.2f}** para **{destinatario_nome}**.\n\n"
            f"@{destinatario_username}, você aceita esta transação?",
            reply_markup=keyboard
        )
        
    except (InvalidOperation, ValueError):
        await update.message.reply_text(
            "❌ **Valor inválido!**\n\n"
            "Use apenas números.\n\n"
            "**Exemplos válidos:**\n"
            "• `/transferir @maria 10`\n"
            "• `/transferir @joao 15.50`"
        )

async def saldos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /saldos - Mostra saldos do grupo"""
    chat_id = update.effective_chat.id
    chat_type = update.effective_chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(update.effective_user.id, update.effective_user.first_name, update.effective_user.username)
    
    if chat_type not in ['group', 'supergroup']:
        await update.message.reply_text(
            "❌ **Este comando está disponível apenas em grupos!**"
        )
        return
    
    usuarios = saldo_bot.listar_usuarios_chat(chat_id)
    
    if not usuarios:
        await update.message.reply_text(
            "📊 **Saldos do Grupo**\n\nNenhum usuário com saldo registrado ainda."
        )
        return
    
    texto_saldos = "📊 **Saldos do Grupo**\n\n"
    for usuario in usuarios[:15]:  # Limitar a 15 usuários
        nome = usuario["name"]
        username = f" (@{usuario['username']})" if usuario.get("username") else ""
        saldo = usuario["saldo"]
        emoji_saldo = "💰" if saldo >= 0 else "🔴"
        texto_saldos += f"{emoji_saldo} **{nome}**{username}: R$ {saldo:.2f}\n"
    
    if len(usuarios) > 15:
        texto_saldos += f"\n... e mais {len(usuarios) - 15} usuários."
    
    await update.message.reply_text(texto_saldos)

# Importar outras funções do bot original (ajuda, soma, saldo, zerar, etc.)
# ... (código das outras funções seria muito longo, mas seguiria o mesmo padrão)

async def soma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /soma - Adiciona valor ao saldo"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    chat_id = update.effective_chat.id
    chat_type = update.effective_chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    if not context.args:
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💰 Usar Menu de Valores", callback_data="menu_adicionar")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ Por favor, informe um valor!\n\n"
            "**Exemplo:** `/soma 15.50`\n\n"
            "💡 **Dica:** Use o menu abaixo para valores rápidos!",
            reply_markup=keyboard
        )
        return
    
    try:
        valor_str = context.args[0].replace(',', '.')
        valor = Decimal(valor_str)
        
        saldo_bot.adicionar_valor(chat_id, user_id, valor)
        novo_saldo = saldo_bot.obter_saldo(chat_id, user_id)
        
        if valor >= 0:
            emoji = "➕"
            acao = "adicionado"
        else:
            emoji = "➖"
            acao = "subtraído"
        
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💰 Adicionar Mais", callback_data="menu_adicionar")],
            [InlineKeyboardButton("📊 Ver Saldo", callback_data="menu_saldo")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        contexto = ""
        if chat_type in ['group', 'supergroup']:
            contexto = " no grupo"
        
        await update.message.reply_text(
            f"{emoji} **{user_name}**, valor {acao} com sucesso{contexto}!\n\n"
            f"💰 **Valor {acao}:** R$ {abs(valor):.2f}\n"
            f"📊 **Saldo atual:** R$ {novo_saldo:.2f}",
            reply_markup=keyboard
        )
        
    except (InvalidOperation, ValueError):
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💰 Usar Menu de Valores", callback_data="menu_adicionar")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ Valor inválido! Use apenas números.\n\n"
            "**Exemplos válidos:**\n"
            "• `/soma 10`\n"
            "• `/soma 15.50`\n"
            "• `/soma -5.25`\n\n"
            "💡 **Dica:** Use o menu abaixo para valores rápidos!",
            reply_markup=keyboard
        )

async def saldo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /saldo - Mostra o saldo atual"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    chat_id = update.effective_chat.id
    chat_type = update.effective_chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    saldo_atual = saldo_bot.obter_saldo(chat_id, user_id)
    
    if saldo_atual >= 0:
        emoji = "💰"
        status = "positivo"
    else:
        emoji = "🔴"
        status = "negativo"
    
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("💰 Adicionar Valor", callback_data="menu_adicionar")],
        [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
    ])
    
    contexto = ""
    if chat_type in ['group', 'supergroup']:
        contexto = " neste grupo"
    
    await update.message.reply_text(
        f"{emoji} **{user_name}**, seu saldo{contexto} é:\n\n"
        f"📊 **R$ {saldo_atual:.2f}** ({status})",
        reply_markup=keyboard
    )

async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /ajuda - Mostra ajuda com menu"""
    user_id = update.effective_user.id
    chat_type = update.effective_chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(update.effective_user.id, update.effective_user.first_name, update.effective_user.username)
    
    if chat_type in ['group', 'supergroup']:
        ajuda_text = """
❓ **Ajuda - Bot em Grupos**

**📋 Comandos disponíveis:**
• `/start` - Inicia o bot e mostra o menu
• `/menu` - Abre o menu interativo
• `/soma <valor>` - Adiciona valor ao seu saldo
• `/saldo` - Mostra seu saldo no grupo
• `/saldos` - Mostra saldos de todos no grupo
• `/transferir @usuario valor` - Transfere valor
• `/ajuda` - Mostra esta ajuda

**💡 Funcionalidades em grupos:**
• Cada usuário tem saldo individual
• Transferências precisam de confirmação
• Administradores podem zerar saldos
• Dados salvos por grupo

**🔒 Comandos de Administrador:**
• `/zerar` - Zera seu saldo
• `/zerar tudo` - Zera saldos do grupo
        """
    else:
        ajuda_text = """
❓ **Ajuda - Como usar o bot**

**📋 Comandos disponíveis:**
• `/start` - Inicia o bot e mostra o menu
• `/menu` - Abre o menu interativo
• `/soma <valor>` - Adiciona valor (ex: /soma 15.50)
• `/saldo` - Mostra seu saldo atual
• `/ajuda` - Mostra esta ajuda

**💡 Dicas:**
• Use valores negativos para subtrair (ex: /soma -10)
• O menu interativo facilita o uso
• Seus dados são salvos automaticamente

**🔒 Comandos de Administrador:**
• `/zerar` - Zera seu saldo
• `/zerar tudo` - Zera todos os saldos
        """
    
    keyboard = criar_menu_principal(user_id, chat_type)
    await update.message.reply_text(ajuda_text, reply_markup=keyboard)

async def zerar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /zerar - Zera saldo (apenas para administradores)"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    chat_id = update.effective_chat.id
    chat_type = update.effective_chat.type
    
    # Registrar usuário
    saldo_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    # Verificar se é administrador
    if user_id != ADMIN_ID:
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")
        ]])
        
        await update.message.reply_text(
            "❌ **Acesso negado!**\n\n"
            "🔒 Apenas administradores podem usar este comando.",
            reply_markup=keyboard
        )
        return
    
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("📊 Ver Saldo", callback_data="menu_saldo")],
        [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
    ])
    
    # Verificar se há argumentos para zerar tudo
    if context.args and context.args[0].lower() == "tudo":
        if chat_type in ['group', 'supergroup']:
            saldo_bot.zerar_todos_saldos(chat_id)
            mensagem = "🔄 **Administrador**, todos os saldos do grupo foram zerados!\n\n✅ Grupo reiniciado com sucesso."
        else:
            saldo_bot.zerar_todos_saldos(chat_id)
            mensagem = "🔄 **Administrador**, todos os saldos foram zerados!\n\n✅ Sistema reiniciado com sucesso."
        
        await update.message.reply_text(mensagem, reply_markup=keyboard)
    else:
        # Zerar apenas o saldo do administrador
        saldo_bot.zerar_saldo(chat_id, user_id)
        
        contexto = ""
        if chat_type in ['group', 'supergroup']:
            contexto = " neste grupo"
            dica = f"💡 **Dica:** Use `/zerar tudo` para zerar todos os saldos do grupo."
        else:
            dica = f"💡 **Dica:** Use `/zerar tudo` para zerar todos os saldos."
        
        await update.message.reply_text(
            f"🔄 **{user_name}**, seu saldo{contexto} foi zerado!\n\n"
            f"📊 **Saldo atual:** R$ 0,00\n\n{dica}",
            reply_markup=keyboard
        )

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Manipula erros"""
    logger.error(f"Erro: {context.error}")

# Função que processa valor personalizado
async def processar_valor_personalizado(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message.reply_to_message:
        return  # ignorar mensagens que não são resposta

    texto = update.message.text.strip().replace(',', '.')
    try:
        valor = float(texto)
    except ValueError:
        await update.message.reply_text("❌ Valor inválido. Digite um número como `25.50` ou `-10.00`.")
        return

    context.args = [str(valor)]
    await soma(update, context)
    context.user_data['saldo'] = context.user_data.get('saldo', 0) + valor

async def main():
    """Função principal"""
    if BOT_TOKEN == "SEU_TOKEN_AQUI":
        print("❌ ERRO: Configure o token do bot no arquivo config.py")
        print("📝 Obtenha seu token em: https://t.me/BotFather")
        return
    
    # Criar aplicação
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Configurar menu de comandos
    application.job_queue.run_once(
        lambda context: configurar_menu_comandos(application),
        when=1
    )
    
    # Adicionar handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("menu", menu))
    application.add_handler(CommandHandler("ajuda", ajuda))
    application.add_handler(CommandHandler("soma", soma))
    application.add_handler(CommandHandler("saldo", saldo))
    application.add_handler(CommandHandler("saldos", saldos))
    application.add_handler(CommandHandler("transferir", transferir))
    application.add_handler(CommandHandler("zerar", zerar))
    
    # Adicionar handler para callbacks dos botões
    application.add_handler(CallbackQueryHandler(callback_handler))
    
    # Adicionar handler de erro
    application.add_error_handler(error_handler)

    # Adicione handler de valor personalizado
    application.add_handler(MessageHandler(filters.REPLY & filters.TEXT, processar_valor_personalizado))

    
    print("🤖 Bot para grupos com menu interativo iniciado! Pressione Ctrl+C para parar.")
    print("📱 Teste o bot enviando /start")
    print("👥 Funciona em grupos e chats privados!")
    print("💸 Transferências com confirmação disponíveis!")
    
    # Executar bot
    await application.run_polling(allowed_updates=Update.ALL_TYPES)
    # await application.initialize()
    # await application.start()

# if __name__ == '__main__':
#     asyncio.run(main())

def start_bot():
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    loop.create_task(main())

