#!/bin/bash

echo "🤖 Instalador do Bot de Saldo para Telegram"
echo "=========================================="

# Verificar se Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não encontrado. Por favor, instale Python 3.7 ou superior."
    exit 1
fi

echo "✅ Python encontrado: $(python3 --version)"

# Instalar dependências
echo "📦 Instalando dependências..."
pip3 install -r requirements.txt

if [ $? -eq 0 ]; then
    echo "✅ Dependências instaladas com sucesso!"
else
    echo "❌ Erro ao instalar dependências."
    exit 1
fi

# Verificar se config.py existe
if [ ! -f "config.py" ]; then
    echo "⚠️  Arquivo config.py não encontrado."
    echo "📝 Copiando arquivo de exemplo..."
    cp config_exemplo.py config.py
    echo "✅ Arquivo config.py criado!"
    echo ""
    echo "🔧 IMPORTANTE: Edite o arquivo config.py com:"
    echo "   1. Seu token do bot (obtido em @BotFather)"
    echo "   2. Seu ID do Telegram (obtido em @userinfobot)"
    echo ""
    echo "📖 Consulte o README.md para instruções detalhadas."
else
    echo "✅ Arquivo config.py encontrado!"
fi

echo ""
echo "🚀 Instalação concluída!"
echo "📱 Para iniciar o bot, execute: python3 bot.py"
echo "📖 Leia o README.md para mais informações."

