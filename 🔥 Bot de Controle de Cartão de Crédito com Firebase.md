# 🔥 Bot de Controle de Cartão de Crédito com Firebase (Variáveis de Ambiente)

## 🎯 Objetivo

Esta versão do bot foi adaptada para ser implantada em plataformas de PaaS (como Render, Heroku, etc.) de forma segura, usando variáveis de ambiente individuais para as credenciais do Firebase, em vez de um arquivo `firebase-credentials.json`.

---

## 🚀 Como Configurar no Render (ou similar)

### 1. **Vá para as Variáveis de Ambiente do seu Serviço**

No painel do seu serviço no Render, localize a seção "Environment" ou "Variáveis de Ambiente".

### 2. **Adicione as Seguintes Variáveis de Ambiente:**

Você precisará adicionar cada uma das seguintes variáveis, copiando os valores do seu arquivo `firebase-credentials.json`:

- **`BOT_TOKEN`**: Seu token do BotFather.
- **`ADMIN_ID`**: Seu ID do Telegram.
- **`FIREBASE_TYPE`**: `service_account`
- **`FIREBASE_PROJECT_ID`**: O ID do seu projeto Firebase (ex: `bot-cartao-credito`).
- **`FIREBASE_PRIVATE_KEY_ID`**: O ID da sua chave privada.
- **`FIREBASE_PRIVATE_KEY`**: A sua chave privada. **Importante:** Copie a chave inteira, incluindo `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----`. No Render, você pode usar o editor de múltiplas linhas para colar a chave completa.
- **`FIREBASE_CLIENT_EMAIL`**: O email do cliente (ex: `firebase-adminsdk-fbsvc@...`).
- **`FIREBASE_CLIENT_ID`**: O ID do cliente.
- **`FIREBASE_AUTH_URI`**: `https://accounts.google.com/o/oauth2/auth`
- **`FIREBASE_TOKEN_URI`**: `https://oauth2.googleapis.com/token`
- **`FIREBASE_AUTH_PROVIDER_X509_CERT_URL`**: `https://www.googleapis.com/oauth2/v1/certs`
- **`FIREBASE_CLIENT_X509_CERT_URL`**: A URL do certificado x509 do cliente.
- **`FIREBASE_UNIVERSE_DOMAIN`**: `googleapis.com`

### 3. **Configure os Comandos de Build e Start**

- **Build Command**: `pip install -r requirements_firebase.txt`
- **Start Command**: `python3 keep_alive_firebase.py`

### 4. **Faça o Deploy**

Com as variáveis de ambiente e os comandos configurados, faça o deploy da sua aplicação. O bot irá ler as variáveis de ambiente individuais e se conectar ao Firebase de forma segura.

---

## 📝 Arquivos Modificados

- **`config_firebase.py`**: Modificado para ler cada variável de ambiente individualmente.
- **`bot_firebase.py`**: Modificado para construir o objeto de credencial do Firebase a partir das variáveis de ambiente individuais.
- **`requirements_firebase.txt`**: Adicionado `python-dotenv` para desenvolvimento local.

---

## 🔒 Segurança

Esta abordagem é mais segura porque:

- **Não expõe credenciais no código**: O arquivo `firebase-credentials.json` não é enviado para o repositório.
- **Usa o sistema de variáveis de ambiente da plataforma**: Que é projetado para armazenar segredos de forma segura.
- **Facilita a rotação de chaves**: Se precisar gerar uma nova chave privada, basta atualizar as variáveis de ambiente no Render, sem precisar alterar o código.

---

## 🧪 Desenvolvimento Local

Para desenvolver localmente, você pode continuar usando um arquivo `.env` com todas as variáveis de ambiente listadas acima. O `config_firebase.py` agora inclui `python-dotenv` para carregar essas variáveis automaticamente quando você executa o bot na sua máquina.

