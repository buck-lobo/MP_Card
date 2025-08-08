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
from config import BOT_TOKEN, ADMIN_ID, DATA_FILE

# Configurar logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class CartaoCreditoBot:
    def __init__(self):
        self.data_file = DATA_FILE
        self.dados = self.carregar_dados()
    
    def carregar_dados(self):
        """Carrega os dados do arquivo JSON"""
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Converter strings de volta para Decimal nos valores monetários
                    self._converter_decimais(data)
                    return data
            except (json.JSONDecodeError, FileNotFoundError):
                logger.warning("Erro ao carregar dados. Iniciando com dados zerados.")
                return self._estrutura_inicial()
        return self._estrutura_inicial()
    
    def _estrutura_inicial(self):
        """Retorna a estrutura inicial de dados"""
        return {
            "usuarios": {},
            "gastos": {},
            "pagamentos": {},
            "configuracoes": {
                "dia_vencimento": 10,  # Dia do vencimento da fatura
                "mes_atual": datetime.now().month,
                "ano_atual": datetime.now().year
            }
        }
    
    def _converter_decimais(self, data):
        """Converte strings para Decimal nos dados carregados"""
        # Converter gastos
        for gasto_id, gasto in data.get("gastos", {}).items():
            if "valor_total" in gasto:
                gasto["valor_total"] = Decimal(gasto["valor_total"])
            if "valor_parcela" in gasto:
                gasto["valor_parcela"] = Decimal(gasto["valor_parcela"])
        
        # Converter pagamentos
        for pagamento_id, pagamento in data.get("pagamentos", {}).items():
            if "valor" in pagamento:
                pagamento["valor"] = Decimal(pagamento["valor"])
    
    def salvar_dados(self):
        """Salva os dados no arquivo JSON"""
        try:
            # Converter Decimal para string para serialização JSON
            data_to_save = json.loads(json.dumps(self.dados, default=str))
            
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
            "last_seen": int(time.time()),
            "ativo": True
        }
        self.salvar_dados()
    
    def adicionar_gasto(self, user_id, descricao, valor_total, parcelas=1):
        """Adiciona um novo gasto"""
        gasto_id = f"{user_id}_{int(time.time())}"
        valor_total = Decimal(str(valor_total))
        valor_parcela = valor_total / parcelas
        
        gasto = {
            "id": gasto_id,
            "user_id": str(user_id),
            "descricao": descricao,
            "valor_total": valor_total,
            "valor_parcela": valor_parcela,
            "parcelas_total": parcelas,
            "parcelas_pagas": 0,
            "data_compra": datetime.now().isoformat(),
            "ativo": True,
            "mes_inicio": datetime.now().month,
            "ano_inicio": datetime.now().year
        }
        
        if "gastos" not in self.dados:
            self.dados["gastos"] = {}
        
        self.dados["gastos"][gasto_id] = gasto
        self.salvar_dados()
        return gasto_id
    
    def adicionar_pagamento(self, user_id, valor, descricao=""):
        """Adiciona um pagamento feito pelo usuário"""
        pagamento_id = f"pag_{user_id}_{int(time.time())}"
        valor = Decimal(str(valor))
        
        pagamento = {
            "id": pagamento_id,
            "user_id": str(user_id),
            "valor": valor,
            "descricao": descricao,
            "data_pagamento": datetime.now().isoformat(),
            "mes": datetime.now().month,
            "ano": datetime.now().year
        }
        
        if "pagamentos" not in self.dados:
            self.dados["pagamentos"] = {}
        
        self.dados["pagamentos"][pagamento_id] = pagamento
        self.salvar_dados()
        return pagamento_id
    
    def calcular_fatura_usuario(self, user_id, mes=None, ano=None):
        """Calcula o valor da fatura de um usuário para um mês específico"""
        if mes is None:
            mes = datetime.now().month
        if ano is None:
            ano = datetime.now().year
        
        user_id_str = str(user_id)
        total_fatura = Decimal('0')
        gastos_mes = []
        
        for gasto_id, gasto in self.dados.get("gastos", {}).items():
            if gasto["user_id"] != user_id_str or not gasto.get("ativo", True):
                continue
            
            # Verificar se o gasto tem parcela no mês solicitado
            if self._gasto_tem_parcela_no_mes(gasto, mes, ano):
                total_fatura += gasto["valor_parcela"]
                gastos_mes.append(gasto)
        
        return total_fatura, gastos_mes
    
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
        
        # Calcular total de gastos até agora
        total_gastos = Decimal('0')
        mes_atual = datetime.now().month
        ano_atual = datetime.now().year
        
        for gasto_id, gasto in self.dados.get("gastos", {}).items():
            if gasto["user_id"] != user_id_str or not gasto.get("ativo", True):
                continue
            
            # Somar todas as parcelas que já venceram
            parcelas_vencidas = self._calcular_parcelas_vencidas(gasto, mes_atual, ano_atual)
            total_gastos += gasto["valor_parcela"] * parcelas_vencidas
        
        # Calcular total de pagamentos
        total_pagamentos = Decimal('0')
        for pagamento_id, pagamento in self.dados.get("pagamentos", {}).items():
            if pagamento["user_id"] == user_id_str:
                total_pagamentos += pagamento["valor"]
        
        return total_gastos - total_pagamentos
    
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
        """Obtém todos os gastos de um usuário"""
        user_id_str = str(user_id)
        gastos_usuario = []
        
        for gasto_id, gasto in self.dados.get("gastos", {}).items():
            if gasto["user_id"] == user_id_str and gasto.get("ativo", True):
                gastos_usuario.append(gasto)
        
        return sorted(gastos_usuario, key=lambda x: x["data_compra"], reverse=True)
    
    def obter_pagamentos_usuario(self, user_id):
        """Obtém todos os pagamentos de um usuário"""
        user_id_str = str(user_id)
        pagamentos_usuario = []
        
        for pagamento_id, pagamento in self.dados.get("pagamentos", {}).items():
            if pagamento["user_id"] == user_id_str:
                pagamentos_usuario.append(pagamento)
        
        return sorted(pagamentos_usuario, key=lambda x: x["data_pagamento"], reverse=True)
    
    def obter_info_usuario(self, user_id):
        """Obtém informações de um usuário"""
        return self.dados.get("usuarios", {}).get(str(user_id), None)
    
    def listar_todos_usuarios(self):
        """Lista todos os usuários ativos (apenas para admin)"""
        usuarios = []
        for user_id, info in self.dados.get("usuarios", {}).items():
            if info.get("ativo", True):
                usuarios.append({
                    "id": user_id,
                    "name": info["name"],
                    "username": info.get("username"),
                    "saldo": self.calcular_saldo_usuario(int(user_id))
                })
        return usuarios
    
    def obter_relatorio_completo(self):
        """Obtém relatório completo para administrador"""
        relatorio = {
            "usuarios": self.listar_todos_usuarios(),
            "total_gastos": Decimal('0'),
            "total_pagamentos": Decimal('0'),
            "saldo_geral": Decimal('0')
        }
        
        # Calcular totais
        for gasto in self.dados.get("gastos", {}).values():
            if gasto.get("ativo", True):
                parcelas_vencidas = self._calcular_parcelas_vencidas(
                    gasto, datetime.now().month, datetime.now().year
                )
                relatorio["total_gastos"] += gasto["valor_parcela"] * parcelas_vencidas
        
        for pagamento in self.dados.get("pagamentos", {}).values():
            relatorio["total_pagamentos"] += pagamento["valor"]
        
        relatorio["saldo_geral"] = relatorio["total_gastos"] - relatorio["total_pagamentos"]
        
        return relatorio

# Instância global do bot
cartao_bot = CartaoCreditoBot()

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

Use o menu abaixo para navegar:
    """
    
    keyboard = criar_menu_principal(user_id)
    await update.message.reply_text(welcome_message, reply_markup=keyboard)

async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /menu - Mostra o menu interativo"""
    user_id = update.effective_user.id
    
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
        keyboard = criar_menu_principal(user_id)
        await query.edit_message_text(
            "💳 **Menu Principal**\n\nEscolha uma opção abaixo:",
            reply_markup=keyboard
        )
    
    elif data == "menu_adicionar_gasto":
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(
            "💳 **Adicionar Gasto**\n\n"
            "Use o comando: `/gasto <descrição> <valor> [parcelas]`\n\n"
            "**Exemplos:**\n"
            "• `/gasto Almoço 25.50` - Gasto à vista\n"
            "• `/gasto Notebook 1200.00 12` - 12 parcelas de R$ 100,00\n"
            "• `/gasto Supermercado 89.90 1` - À vista (1 parcela)\n\n"
            "💡 **Dica:** Se não informar parcelas, será considerado à vista (1 parcela).",
            reply_markup=keyboard
        )
    
    elif data == "menu_pagamento":
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(
            "💰 **Registrar Pagamento**\n\n"
            "Use o comando: `/pagamento <valor> [descrição]`\n\n"
            "**Exemplos:**\n"
            "• `/pagamento 150.00` - Pagamento simples\n"
            "• `/pagamento 200.50 Pagamento fatura março` - Com descrição\n\n"
            "💡 **Dica:** O pagamento será abatido do seu saldo devedor.",
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
            f"Status: {status.title()}",
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
                
                data_compra = datetime.fromisoformat(gasto['data_compra']).strftime("%d/%m/%y")
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
                data_pagamento = datetime.fromisoformat(pagamento['data_pagamento']).strftime("%d/%m/%y")
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
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(texto_relatorio, reply_markup=keyboard)
    
    elif data == "menu_ajuda":
        ajuda_text = """
❓ **Ajuda - Bot de Cartão de Crédito**

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

**📅 Parcelas:**
• O bot controla automaticamente as parcelas
• Cada mês, a parcela correspondente é adicionada à fatura
• Gastos parcelados são distribuídos ao longo dos meses
        """
        
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔙 Voltar", callback_data="menu_principal")
        ]])
        
        await query.edit_message_text(ajuda_text, reply_markup=keyboard)

async def gasto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /gasto - Adiciona um novo gasto"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    if len(context.args) < 2:
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💳 Menu Gastos", callback_data="menu_adicionar_gasto")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ **Uso incorreto!**\n\n"
            "**Formato:** `/gasto <descrição> <valor> [parcelas]`\n\n"
            "**Exemplos:**\n"
            "• `/gasto Almoço 25.50`\n"
            "• `/gasto Notebook 1200.00 12`\n"
            "• `/gasto Supermercado 89.90 1`",
            reply_markup=keyboard
        )
        return
    
    try:
        # Extrair descrição (pode ter espaços)
        descricao_parts = context.args[:-2] if len(context.args) > 2 else context.args[:-1]
        descricao = " ".join(descricao_parts) if descricao_parts else context.args[0]
        
        # Extrair valor
        valor_str = context.args[-2] if len(context.args) > 2 else context.args[-1]
        valor = Decimal(valor_str.replace(',', '.'))
        
        # Extrair parcelas (opcional)
        parcelas = 1
        if len(context.args) > 2:
            try:
                parcelas = int(context.args[-1])
                if parcelas < 1:
                    parcelas = 1
            except ValueError:
                # Se o último argumento não for um número, incluir na descrição
                descricao = " ".join(context.args[:-1])
                parcelas = 1
        
        if valor <= 0:
            await update.message.reply_text("❌ **Valor deve ser maior que zero!**")
            return
        
        if parcelas > 60:
            await update.message.reply_text("❌ **Máximo de 60 parcelas permitido!**")
            return
        
        # Adicionar gasto
        gasto_id = cartao_bot.adicionar_gasto(user_id, descricao, valor, parcelas)
        valor_parcela = valor / parcelas
        
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
                f"📅 **Data:** {datetime.now().strftime('%d/%m/%Y')}"
            )
        else:
            texto_confirmacao = (
                f"✅ **Gasto registrado com sucesso!**\n\n"
                f"📝 **Descrição:** {descricao}\n"
                f"💰 **Valor total:** R$ {valor:.2f}\n"
                f"📊 **Parcelas:** {parcelas}x R$ {valor_parcela:.2f}\n"
                f"📅 **Data:** {datetime.now().strftime('%d/%m/%Y')}"
            )
        
        await update.message.reply_text(texto_confirmacao, reply_markup=keyboard)
        
    except (InvalidOperation, ValueError) as e:
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💳 Menu Gastos", callback_data="menu_adicionar_gasto")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ **Erro nos dados informados!**\n\n"
            "Verifique se o valor está correto e as parcelas são um número inteiro.\n\n"
            "**Formato:** `/gasto <descrição> <valor> [parcelas]`",
            reply_markup=keyboard
        )

async def pagamento(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /pagamento - Registra um pagamento"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
    # Registrar usuário
    cartao_bot.registrar_usuario(user_id, user_name, update.effective_user.username)
    
    if len(context.args) < 1:
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💰 Menu Pagamentos", callback_data="menu_pagamento")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ **Uso incorreto!**\n\n"
            "**Formato:** `/pagamento <valor> [descrição]`\n\n"
            "**Exemplos:**\n"
            "• `/pagamento 150.00`\n"
            "• `/pagamento 200.50 Pagamento fatura março`",
            reply_markup=keyboard
        )
        return
    
    try:
        # Extrair valor
        valor_str = context.args[0]
        valor = Decimal(valor_str.replace(',', '.'))
        
        # Extrair descrição (opcional)
        descricao = " ".join(context.args[1:]) if len(context.args) > 1 else "Pagamento"
        
        if valor <= 0:
            await update.message.reply_text("❌ **Valor deve ser maior que zero!**")
            return
        
        # Calcular saldo antes do pagamento
        saldo_antes = cartao_bot.calcular_saldo_usuario(user_id)
        
        # Adicionar pagamento
        pagamento_id = cartao_bot.adicionar_pagamento(user_id, valor, descricao)
        
        # Calcular novo saldo
        saldo_depois = cartao_bot.calcular_saldo_usuario(user_id)
        
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
            f"{emoji_saldo} **{texto_saldo}**"
        )
        
        await update.message.reply_text(texto_confirmacao, reply_markup=keyboard)
        
    except (InvalidOperation, ValueError):
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("💰 Menu Pagamentos", callback_data="menu_pagamento")],
            [InlineKeyboardButton("🔙 Menu Principal", callback_data="menu_principal")]
        ])
        
        await update.message.reply_text(
            "❌ **Valor inválido!**\n\n"
            "Use apenas números.\n\n"
            "**Exemplos válidos:**\n"
            "• `/pagamento 100`\n"
            "• `/pagamento 150.50`",
            reply_markup=keyboard
        )

async def saldo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /saldo - Mostra o saldo atual"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name
    
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
        f"Status: {status.title()}",
        reply_markup=keyboard
    )

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Manipula erros"""
    logger.error(f"Erro: {context.error}")

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
    application.add_handler(CommandHandler("gasto", gasto))
    application.add_handler(CommandHandler("pagamento", pagamento))
    application.add_handler(CommandHandler("saldo", saldo))
    
    # Adicionar handler para callbacks dos botões
    application.add_handler(CallbackQueryHandler(callback_handler))
    
    # Adicionar handler de erro
    application.add_error_handler(error_handler)
    
    print("💳 Bot de Controle de Cartão de Crédito iniciado! Pressione Ctrl+C para parar.")
    print("📱 Teste o bot enviando /start")
    print("🔒 Dados privados por usuário!")
    print("📊 Controle de parcelas automático!")
    
    # Executar bot
    await application.initialize()
    await application.start()
    print("Bot rodando...")
    await application.updater.start_polling()

async def start_bot():
    asyncio.create_task(main())

