# 🔥 Guia de Configuração Firebase - Passo a Passo

## 🎯 Objetivo

Este guia te ajudará a configurar o Firebase Firestore para o seu bot de controle de cartão de crédito, desde a criação do projeto até o primeiro teste.

---

## 📋 Pré-requisitos

- Conta Google ativa
- Acesso ao [Firebase Console](https://console.firebase.google.com/)
- Bot do Telegram já criado via @BotFather

---

## 🚀 Passo 1: Criar Projeto Firebase

### 1.1 Acessar Firebase Console

1. Abra seu navegador e vá para: https://console.firebase.google.com/
2. Faça login com sua conta Google
3. Clique em **"Adicionar projeto"** ou **"Create a project"**

### 1.2 Configurar Projeto

1. **Nome do projeto:**
   - Digite: `bot-cartao-credito` (ou nome de sua preferência)
   - O Firebase gerará um ID único automaticamente

2. **Google Analytics:**
   - **Recomendação:** Desabilite por enquanto
   - Clique em **"Continuar"**

3. **Finalizar:**
   - Aguarde a criação do projeto (1-2 minutos)
   - Clique em **"Continuar"** quando pronto

---

## 🗄️ Passo 2: Configurar Firestore Database

### 2.1 Ativar Firestore

1. No painel do projeto, clique em **"Firestore Database"** no menu lateral
2. Clique em **"Criar banco de dados"**

### 2.2 Configurar Modo de Segurança

1. **Escolha o modo:**
   - Selecione **"Iniciar no modo de teste"**
   - ⚠️ **Importante:** Vamos configurar regras de segurança depois

2. **Clique em "Avançar"**

### 2.3 Escolher Localização

1. **Região recomendada para Brasil:**
   - `southamerica-east1 (São Paulo)`
   - Ou `us-central1` se preferir

2. **Clique em "Concluído"**

### 2.4 Aguardar Provisionamento

- O Firestore será criado (pode levar alguns minutos)
- Você verá a interface do banco de dados vazia

---

## 🔐 Passo 3: Criar Conta de Serviço

### 3.1 Acessar Configurações

1. Clique no ícone de **engrenagem** ⚙️ no menu lateral
2. Selecione **"Configurações do projeto"**
3. Clique na aba **"Contas de serviço"**

### 3.2 Gerar Chave Privada

1. **Selecione linguagem:**
   - Escolha **"Python"** na lista

2. **Gerar chave:**
   - Clique em **"Gerar nova chave privada"**
   - Confirme clicando em **"Gerar chave"**

3. **Download automático:**
   - Um arquivo JSON será baixado automaticamente
   - **Nome típico:** `nome-do-projeto-firebase-adminsdk-xxxxx.json`

### 3.3 Renomear Arquivo

1. **Renomeie o arquivo baixado para:**
   ```
   firebase-credentials.json
   ```

2. **Guarde em local seguro:**
   - Este arquivo contém credenciais sensíveis
   - Nunca compartilhe ou publique este arquivo

---

## 📝 Passo 4: Anotar Informações Importantes

### 4.1 Project ID

1. **Localizar Project ID:**
   - Na página "Configurações do projeto"
   - Seção "Seus projetos"
   - Anote o **"ID do projeto"** (não o nome)

2. **Exemplo:**
   ```
   Nome: Bot Cartão Crédito
   ID: bot-cartao-credito-a1b2c
   ```

### 4.2 Informações para .env

Anote estas informações para configurar depois:

```bash
# Anote aqui:
FIREBASE_PROJECT_ID=seu_project_id_aqui
FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json
```

---

## 🔒 Passo 5: Configurar Regras de Segurança

### 5.1 Acessar Regras

1. No Firestore Database, clique na aba **"Regras"**
2. Você verá as regras atuais (modo de teste)

### 5.2 Atualizar Regras

1. **Substitua o conteúdo por:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir acesso apenas a aplicações autenticadas
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

2. **Clique em "Publicar"**

### 5.3 Verificar Regras

- As regras devem estar ativas
- Status: **"Regras ativas"**

---

## ⚙️ Passo 6: Configurar o Bot

### 6.1 Preparar Arquivos

1. **Coloque o arquivo de credenciais:**
   ```bash
   # Na pasta do seu bot
   cp /caminho/para/firebase-credentials.json ./
   ```

2. **Configure o arquivo .env:**
   ```bash
   # .env
   BOT_TOKEN=seu_token_do_botfather
   ADMIN_ID=seu_id_do_telegram
   FIREBASE_PROJECT_ID=seu_project_id
   FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json
   ```

### 6.2 Instalar Dependências

```bash
pip install -r requirements_firebase.txt
```

### 6.3 Testar Configuração

```bash
python3 -c "
from config_firebase import *
print('✅ BOT_TOKEN configurado:', bool(BOT_TOKEN))
print('✅ ADMIN_ID configurado:', bool(ADMIN_ID))
print('✅ FIREBASE_PROJECT_ID:', FIREBASE_PROJECT_ID)
print('✅ Arquivo de credenciais existe:', os.path.exists(FIREBASE_CREDENTIALS_PATH))
"
```

---

## 🧪 Passo 7: Primeiro Teste

### 7.1 Testar Conexão Firebase

```bash
python3 -c "
from bot_firebase import cartao_bot
print('🔥 Firebase conectado:', cartao_bot.db is not None)
print('📊 Testando escrita...')
# Teste simples
cartao_bot.registrar_usuario(123456, 'Teste', 'teste')
print('✅ Teste concluído!')
"
```

### 7.2 Verificar no Console

1. **Volte ao Firebase Console**
2. **Vá em Firestore Database**
3. **Você deve ver:**
   - Coleção `usuarios`
   - Documento `123456`
   - Dados do usuário teste

### 7.3 Executar Bot

```bash
python3 bot_firebase.py
```

**Saída esperada:**
```
💳 Bot de Controle de Cartão de Crédito com Firebase iniciado!
📱 Interface otimizada ativa!
☁️ Dados armazenados no Firebase Firestore!
```

---

## 🎯 Passo 8: Teste Completo

### 8.1 Testar no Telegram

1. **Abra o Telegram**
2. **Encontre seu bot**
3. **Envie:** `/start`

**Resposta esperada:**
```
💳 Olá [Seu Nome]! Bem-vindo ao Bot de Controle de Cartão de Crédito!

🎯 Funcionalidades:
• Registrar gastos com descrição e parcelas
• Acompanhar saldo devedor
• Registrar pagamentos
• Ver fatura mensal
• Histórico completo de gastos e pagamentos

🔒 Privacidade: Você só vê seus próprios dados.
☁️ Dados seguros: Armazenados no Firebase Cloud.

Use o menu abaixo para navegar:
```

### 8.2 Testar Funcionalidade

1. **Clique em "💳 Adicionar Gasto"**
2. **Digite:** `Teste 10.00`
3. **Verifique confirmação**

### 8.3 Verificar no Firebase

1. **Volte ao Console Firebase**
2. **Atualize a página**
3. **Você deve ver:**
   - Coleção `gastos`
   - Novo documento com o gasto teste

---

## ✅ Checklist Final

Marque cada item conforme completa:

- [ ] ✅ Projeto Firebase criado
- [ ] ✅ Firestore Database ativado
- [ ] ✅ Conta de serviço criada
- [ ] ✅ Arquivo de credenciais baixado e renomeado
- [ ] ✅ Project ID anotado
- [ ] ✅ Regras de segurança configuradas
- [ ] ✅ Arquivo .env configurado
- [ ] ✅ Dependências instaladas
- [ ] ✅ Teste de conexão realizado
- [ ] ✅ Bot executando sem erros
- [ ] ✅ Teste no Telegram funcionando
- [ ] ✅ Dados aparecendo no Firebase Console

---

## 🚨 Problemas Comuns

### Erro: "Invalid service account certificate"

**Causa:** Arquivo de credenciais incorreto ou corrompido

**Solução:**
1. Baixe novamente o arquivo de credenciais
2. Verifique se o arquivo não está corrompido
3. Confirme se o caminho está correto no .env

### Erro: "Permission denied"

**Causa:** Regras de segurança muito restritivas

**Solução:**
1. Verifique se as regras foram publicadas corretamente
2. Temporariamente, use regras mais permissivas para teste:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Bot não responde

**Causa:** Token incorreto ou bot não iniciado

**Solução:**
1. Verifique se BOT_TOKEN está correto
2. Confirme se o bot está rodando
3. Verifique logs de erro

---

## 🎉 Parabéns!

Se chegou até aqui, seu bot está configurado e funcionando com Firebase! 

### Próximos Passos:

1. **Teste todas as funcionalidades**
2. **Configure deploy em produção**
3. **Faça backup das credenciais**
4. **Monitore uso no Firebase Console**

### Recursos Úteis:

- [Firebase Console](https://console.firebase.google.com/)
- [Documentação Firestore](https://firebase.google.com/docs/firestore)
- [Monitoramento de Uso](https://console.firebase.google.com/project/_/usage)

---

**🔥 Seu bot agora tem o poder do Firebase!**

