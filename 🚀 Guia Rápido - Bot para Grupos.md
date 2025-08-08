# 🚀 Guia Rápido - Bot para Grupos

## ⚡ Início Rápido

1. **Execute o bot para grupos:**
   ```bash
   python3 bot_grupos.py
   ```

2. **Adicione o bot ao grupo**

3. **No grupo, envie:**
   ```
   /start
   ```

4. **Explore as funcionalidades específicas para grupos!**

## 👥 Funcionalidades Exclusivas para Grupos

### 📊 Saldos Individuais por Grupo
- Cada usuário tem saldo separado em cada grupo
- Saldos não se misturam entre grupos diferentes
- Registro automático ao interagir com o bot

### 💸 Transferências com Confirmação
- Envie valores para outros membros do grupo
- Destinatário deve confirmar a transação
- Validação automática de saldo suficiente

### 🔍 Visualização de Saldos do Grupo
- Veja todos os saldos dos membros
- Lista organizada com nomes e usernames
- Indicação visual de saldos positivos/negativos

## 🎛️ Menu Interativo para Grupos

### Menu Principal (Grupos)
```
🤖 Bot de Saldo - Grupo

┌─────────────────────────────┐
│ 💰 Adicionar Valor          │
├─────────────────────────────┤
│ 📊 Ver Saldo               │
├─────────────────────────────┤
│ 👥 Saldos do Grupo         │
├─────────────────────────────┤
│ 💸 Transferir              │
├─────────────────────────────┤
│ 🔄 Zerar Meu Saldo (Admin) │
├─────────────────────────────┤
│ 🗑️ Zerar Grupo (Admin)     │
├─────────────────────────────┤
│ ❓ Ajuda                   │
└─────────────────────────────┘
```

## 💸 Como Transferir

### 1. Comando Básico
```
/transferir @usuario valor
```

### 2. Exemplos Práticos
```
/transferir @maria 25.50    # Transfere R$ 25,50 para Maria
/transferir @joao 100       # Transfere R$ 100,00 para João
/transferir @ana -10.25     # Solicita R$ 10,25 de Ana
```

### 3. Fluxo de Confirmação
```
1. João: /transferir @maria 25.50
   ↓
2. Bot: "João quer transferir R$ 25,50 para Maria"
   [✅ Confirmar] [❌ Rejeitar]
   ↓
3. Maria clica em ✅ Confirmar
   ↓
4. Bot: "✅ Transferência confirmada!"
   Novos saldos exibidos
```

## 📋 Comandos Específicos para Grupos

| Comando | Função | Exemplo |
|---------|--------|---------|
| `/saldos` | Ver todos os saldos do grupo | `/saldos` |
| `/transferir @user valor` | Transferir para usuário | `/transferir @joao 50` |
| `/zerar tudo` | Zerar grupo (admin) | `/zerar tudo` |

## 🔒 Funcionalidades Administrativas

### Para Administradores
- **Zerar saldo próprio**: `/zerar`
- **Zerar grupo inteiro**: `/zerar tudo`
- **Acesso via menu**: Botões especiais no menu principal

### Controle de Acesso
- Apenas usuário configurado em `ADMIN_ID`
- Funções isoladas por grupo
- Tentativas não autorizadas são bloqueadas

## 📊 Exemplo de Uso em Grupo

### Cenário: Grupo de Amigos
```
👥 Grupo: "Amigos do Churrasco"

📊 Saldos iniciais:
• João: R$ 0,00
• Maria: R$ 0,00
• Pedro: R$ 0,00
• Ana: R$ 0,00

🛒 João compra carne: /soma 120.00
📊 João: R$ 120,00

🍺 Maria compra bebidas: /soma 80.00
📊 Maria: R$ 80,00

💸 Divisão dos custos:
João: /transferir @maria 40.00
João: /transferir @pedro 40.00
João: /transferir @ana 40.00

Maria: /transferir @pedro 20.00
Maria: /transferir @ana 20.00

📊 Saldos finais:
• João: R$ 0,00 (120 - 40 - 40 - 40)
• Maria: R$ 20,00 (80 - 20 - 20 + 40)
• Pedro: R$ -60,00 (0 - 40 - 20)
• Ana: R$ -60,00 (0 - 40 - 20)
```

## 🔍 Visualização de Saldos

### Comando /saldos
```
📊 Saldos do Grupo

💰 João (@joao): R$ 125,50
💰 Maria (@maria): R$ 89,75
🔴 Pedro (@pedro): R$ -15,00
💰 Ana: R$ 200,00
```

### Indicadores Visuais
- 💰 = Saldo positivo
- 🔴 = Saldo negativo
- Username quando disponível
- Valores formatados em reais

## ⚠️ Validações Automáticas

### Transferências
- ✅ Saldo suficiente do remetente
- ✅ Usuário destinatário existe
- ✅ Valor numérico válido
- ✅ Não permite auto-transferência

### Confirmações
- ✅ Apenas destinatário pode confirmar
- ✅ Transações expiram automaticamente
- ✅ Notificações para ambas as partes

## 🛠️ Troubleshooting Rápido

### Problemas Comuns
- **"Usuário não encontrado"**: Destinatário deve ter interagido com o bot
- **"Saldo insuficiente"**: Verifique saldo com `/saldo`
- **"Transação expirada"**: Envie nova solicitação

### Soluções Rápidas
- Todos devem enviar `/start` pelo menos uma vez
- Use `/saldos` para ver quem está registrado
- Verifique se @ está correto no username

## 🎯 Dicas de Uso

### Para Grupos Novos
1. Administrador adiciona o bot
2. Todos enviam `/start`
3. Teste com transferência pequena
4. Configure admin se necessário

### Para Melhor Experiência
- Use usernames (@usuario) sempre que possível
- Confirme transferências rapidamente
- Monitore saldos regularmente com `/saldos`
- Use valores decimais quando necessário (ex: 10.50)

## 📱 Compatibilidade

### Tipos de Chat Suportados
- ✅ **Grupos**: Funcionalidades completas
- ✅ **Supergrupos**: Funcionalidades completas
- ✅ **Chat privado**: Funcionalidades básicas (sem transferências)

### Limitações
- Máximo 15 usuários exibidos em `/saldos`
- Transferências apenas dentro do mesmo grupo
- Confirmações não expiram automaticamente (manual)

