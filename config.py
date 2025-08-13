import os
# # Descomentar para testes locais
# from dotenv import load_dotenv

# # Carrega as variáveis do arquivo .env
# load_dotenv()

# Configurações do Bot Telegram
BOT_TOKEN = os.environ.get("BOT_TOKEN")
ADMIN_ID = int(os.environ.get("ADMIN_ID")) if os.environ.get("ADMIN_ID") else None

# Configurações do Firebase (variáveis de ambiente individuais)
FIREBASE_TYPE = os.environ.get("FIREBASE_TYPE")
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID")
FIREBASE_PRIVATE_KEY_ID = os.environ.get("FIREBASE_PRIVATE_KEY_ID")
FIREBASE_PRIVATE_KEY = os.environ.get("FIREBASE_PRIVATE_KEY")
FIREBASE_CLIENT_EMAIL = os.environ.get("FIREBASE_CLIENT_EMAIL")
FIREBASE_CLIENT_ID = os.environ.get("FIREBASE_CLIENT_ID")
FIREBASE_AUTH_URI = os.environ.get("FIREBASE_AUTH_URI")
FIREBASE_TOKEN_URI = os.environ.get("FIREBASE_TOKEN_URI")
FIREBASE_AUTH_PROVIDER_X509_CERT_URL = os.environ.get("FIREBASE_AUTH_PROVIDER_X509_CERT_URL")
FIREBASE_CLIENT_X509_CERT_URL = os.environ.get("FIREBASE_CLIENT_X509_CERT_URL")
FIREBASE_UNIVERSE_DOMAIN = os.environ.get("FIREBASE_UNIVERSE_DOMAIN")

# Configurações das coleções no Firestore
COLLECTION_USUARIOS = "usuarios"
COLLECTION_GASTOS = "gastos"
COLLECTION_PAGAMENTOS = "pagamentos"
COLLECTION_CONFIGURACOES = "configuracoes"

