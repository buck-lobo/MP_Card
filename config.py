import os
# # Descomentar para testes locais
# from dotenv import load_dotenv

# # Carrega as variáveis do arquivo .env
# load_dotenv()

# Configurações do Bot Telegram
BOT_TOKEN = os.environ.get("BOT_TOKEN")
ADMIN_ID = int(os.environ.get("ADMIN_ID")) if os.environ.get("ADMIN_ID") else None

# Configurações do Firebase
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID")
FIREBASE_CREDENTIALS_PATH = os.environ.get("FIREBASE_CREDENTIALS_PATH")

# Para usar credenciais via JSON string (recomendado para deploy)
FIREBASE_CREDENTIALS_JSON = os.environ.get("FIREBASE_CREDENTIALS_JSON")

# Configurações das coleções no Firestore
COLLECTION_USUARIOS = "usuarios"
COLLECTION_GASTOS = "gastos"
COLLECTION_PAGAMENTOS = "pagamentos"
COLLECTION_CONFIGURACOES = "configuracoes"

