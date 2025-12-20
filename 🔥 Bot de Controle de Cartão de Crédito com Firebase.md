# 🔥 Bot de Controle de Cartão de Crédito com Firebase (Hosting + Functions)

## 🎯 Objetivo

Documentar como executar todo o projeto (bot + mini app) exclusivamente dentro do ecossistema Firebase, sem depender de Render ou outras PaaS.

---

## 🚀 Deploy do Bot Python no Firebase Hosting (Cloud Run w/ Functions)

1. **Configurar variáveis de ambiente**
   - No Firebase Console, acesse *Build › Functions › Variables* (ou use `firebase functions:config:set`).
   - Defina:
     - `BOT_TOKEN`
     - `ADMIN_ID`
     - `FIREBASE_TYPE`, `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_AUTH_URI`, `FIREBASE_TOKEN_URI`, `FIREBASE_AUTH_PROVIDER_X509_CERT_URL`, `FIREBASE_CLIENT_X509_CERT_URL`, `FIREBASE_UNIVERSE_DOMAIN`
   - No ambiente local, use `.env` (não versionado) com os mesmos campos.

2. **Deploy**
   - `firebase deploy --only functions,hosting`
   - O bot é iniciado a partir do código Python (ver `bot.py`), e o Hosting serve o mini app/landing page.

---

## 📝 Arquivos relevantes

- `bot.py` / `config.py`: leem as variáveis definidas acima.
- `functions/`: Cloud Functions em Node/TS para WebApp/mini app.
- `firebase.json` / `firebase-credentials.json`: configuração dos targets.

---

## 🔒 Segurança

- Segredos apenas via variáveis de ambiente do Firebase.
- Token e credenciais devem ser rotacionados pelo Console (já sem Render).
- Secret scanning ativo para evitar regressões.

---

## 🧪 Desenvolvimento Local

- Use `.env` e `firebase-credentials.json` somente localmente.
- Rode `python bot.py` para o bot ou `firebase emulators:start` para testar Functions.

