# 💳 Bot de Controle de Cartão de Crédito - Versão Otimizada

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Funcionalidades Principais](#funcionalidades-principais)
3. [Interface Otimizada](#interface-otimizada)
4. [Instalação e Configuração](#instalação-e-configuração)
5. [Guia de Uso](#guia-de-uso)
6. [Comandos Disponíveis](#comandos-disponíveis)
7. [Sistema de Parcelas](#sistema-de-parcelas)
8. [Privacidade e Segurança](#privacidade-e-segurança)
9. [Funcionalidades Administrativas](#funcionalidades-administrativas)
10. [Estrutura de Dados](#estrutura-de-dados)
11. [Exemplos Práticos](#exemplos-práticos)
12. [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

O **Bot de Controle de Cartão de Crédito** é uma solução completa para gerenciar gastos de terceiros em seu cartão de crédito. Desenvolvido especificamente para situações onde múltiplas pessoas utilizam o mesmo cartão, o bot oferece controle granular de despesas, sistema de parcelas automático, registro de pagamentos e relatórios detalhados.

### 🌟 Principais Diferenciais

- **Interface Otimizada**: Sistema de "modo de escuta" que elimina a necessidade de repetir comandos
- **Controle de Parcelas**: Gestão automática de compras parceladas com cálculo mensal preciso
- **Privacidade Total**: Cada usuário vê apenas seus próprios dados
- **Acesso Administrativo**: Relatórios completos para o administrador do cartão
- **Persistência de Dados**: Armazenamento seguro em arquivo JSON
- **Interface Intuitiva**: Menu interativo com botões para facilitar o uso

## 🚀 Funcionalidades Principais

### 💳 Registro de Gastos Detalhados

O bot permite registrar gastos com informações completas:

- **Descrição personalizada**: Identifique facilmente cada compra
- **Valor preciso**: Suporte a valores decimais (ex: R$ 25,50)
- **Sistema de parcelas**: De 1 até 60 parcelas
- **Data automática**: Registro automático da data da compra
- **Cálculo automático**: Valor das parcelas calculado automaticamente

### 💰 Sistema de Pagamentos

Controle completo dos pagamentos realizados:

- **Registro de pagamentos**: Valor e descrição opcional
- **Abatimento automático**: Redução automática do saldo devedor
- **Histórico completo**: Todos os pagamentos ficam registrados
- **Cálculo de saldo**: Saldo atual sempre atualizado

### 📊 Relatórios e Consultas

Informações detalhadas sempre disponíveis:

- **Saldo atual**: Devedor, credor ou quitado
- **Fatura mensal**: Valor a pagar no mês atual
- **Histórico de gastos**: Lista completa de todas as compras
- **Histórico de pagamentos**: Registro de todos os pagamentos
- **Status de parcelas**: Quantas foram pagas e quantas restam

### 🔒 Privacidade e Segurança

Sistema robusto de proteção de dados:

- **Isolamento por usuário**: Cada pessoa vê apenas seus dados
- **Acesso administrativo**: Apenas o admin vê dados de todos
- **Validações automáticas**: Verificação de dados antes do armazenamento
- **Backup automático**: Dados salvos automaticamente após cada operação

## ⚡ Interface Otimizada

### 🎛️ Sistema de Modo de Escuta

A principal inovação desta versão é o **sistema de modo de escuta**, que revoluciona a experiência do usuário:

#### Como Funciona

1. **Clique no botão desejado** (ex: "💳 Adicionar Gasto")
2. **O bot entra em modo de escuta** para aquela função específica
3. **Digite apenas as informações** necessárias (sem repetir o comando)
4. **O bot processa automaticamente** e confirma a operação

#### Exemplo Prático

**Método Tradicional:**
```
Usuário: /gasto Almoço 25.50 1
Bot: ✅ Gasto registrado...
```

**Método Otimizado:**
```
Usuário: [Clica em "💳 Adicionar Gasto"]
Bot: ✏️ Aguardando sua mensagem...
Usuário: Almoço 25.50
Bot: ✅ Gasto registrado...
```

### 🎯 Vantagens da Interface Otimizada

- **Menos digitação**: Não precisa repetir comandos
- **Mais intuitivo**: Interface visual com botões
- **Menos erros**: Validação em tempo real
- **Experiência fluida**: Navegação natural
- **Compatibilidade**: Comandos tradicionais ainda funcionam

## 🛠️ Instalação e Configuração

### Pré-requisitos

- Python 3.7 ou superior
- Biblioteca `python-telegram-bot`
- Token do bot do Telegram
- ID do administrador

### Passo a Passo

1. **Obter Token do Bot**
   - Acesse @BotFather no Telegram
   - Crie um novo bot com `/newbot`
   - Copie o token fornecido

2. **Obter ID do Administrador**
   - Acesse @userinfobot no Telegram
   - Envie qualquer mensagem
   - Copie seu ID numérico

3. **Configurar o Bot**
   ```python
   # config.py
   BOT_TOKEN = "SEU_TOKEN_AQUI"
   ADMIN_ID = 123456789  # Seu ID numérico
   DATA_FILE = "cartao_data.json"
   ```

4. **Instalar Dependências**
   ```bash
   pip install python-telegram-bot
   ```

5. **Executar o Bot**
   ```bash
   python3 bot_cartao_otimizado.py
   ```

### Estrutura de Arquivos

```
telegram_bot/
├── bot_cartao_otimizado.py    # Arquivo principal do bot
├── config.py                  # Configurações
├── cartao_data.json          # Dados (criado automaticamente)
└── requirements.txt          # Dependências
```

## 📱 Guia de Uso

### Primeiro Acesso

1. **Iniciar o bot**: Envie `/start`
2. **Explorar o menu**: Use os botões interativos
3. **Registrar primeiro gasto**: Clique em "💳 Adicionar Gasto"
4. **Verificar saldo**: Clique em "📊 Meu Saldo"

### Fluxo Típico de Uso

#### Registrar um Gasto

1. Clique em **"💳 Adicionar Gasto"**
2. Digite: `Supermercado 89.90 1`
3. Confirme o registro
4. Verifique o saldo atualizado

#### Registrar um Pagamento

1. Clique em **"💰 Registrar Pagamento"**
2. Digite: `150.00 Pagamento fatura`
3. Confirme o pagamento
4. Veja o saldo reduzido

#### Consultar Informações

- **Saldo atual**: "📊 Meu Saldo"
- **Fatura do mês**: "🧾 Fatura Atual"
- **Histórico**: "📋 Meus Gastos" ou "💸 Meus Pagamentos"

### Navegação no Menu

O menu principal oferece acesso rápido a todas as funcionalidades:

```
💳 Bot de Controle de Cartão

┌─────────────────────────────┐
│ 💳 Adicionar Gasto          │
├─────────────────────────────┤
│ 💰 Registrar Pagamento      │
├─────────────────────────────┤
│ 📊 Meu Saldo               │
├─────────────────────────────┤
│ 📋 Meus Gastos             │
├─────────────────────────────┤
│ 🧾 Fatura Atual            │
├─────────────────────────────┤
│ 💸 Meus Pagamentos         │
├─────────────────────────────┤
│ ❓ Ajuda                   │
└─────────────────────────────┘
```

## 📋 Comandos Disponíveis

### Comandos Básicos

| Comando | Função | Exemplo |
|---------|--------|---------|
| `/start` | Iniciar o bot | `/start` |
| `/menu` | Abrir menu principal | `/menu` |
| `/saldo` | Ver saldo atual | `/saldo` |
| `/ajuda` | Ver ajuda | `/ajuda` |

### Comandos de Registro

| Comando | Função | Formato | Exemplo |
|---------|--------|---------|---------|
| `/gasto` | Adicionar gasto | `<desc> <valor> [parcelas]` | `/gasto Almoço 25.50` |
| `/pagamento` | Registrar pagamento | `<valor> [descrição]` | `/pagamento 100.00` |

### Comandos de Consulta

| Comando | Função | Exemplo |
|---------|--------|---------|
| `/fatura` | Ver fatura atual | `/fatura` |
| `/gastos` | Ver histórico de gastos | `/gastos` |
| `/pagamentos` | Ver histórico de pagamentos | `/pagamentos` |

### Comandos Administrativos

| Comando | Função | Acesso | Exemplo |
|---------|--------|--------|---------|
| `/relatorio` | Relatório geral | Admin | `/relatorio` |
| `/usuario` | Consultar usuário | Admin | `/usuario João` |

## 📊 Sistema de Parcelas

### Como Funciona

O bot implementa um sistema inteligente de controle de parcelas que:

1. **Calcula automaticamente** o valor de cada parcela
2. **Distribui mensalmente** as parcelas na fatura
3. **Controla o status** de parcelas pagas/pendentes
4. **Atualiza automaticamente** conforme os meses passam

### Exemplo Prático

**Compra:** Notebook R$ 1.200,00 em 12 parcelas
- **Valor da parcela:** R$ 100,00
- **Mês 1:** R$ 100,00 na fatura
- **Mês 2:** R$ 100,00 na fatura
- **...**
- **Mês 12:** R$ 100,00 na fatura (última parcela)

### Cálculo de Parcelas Vencidas

O sistema calcula automaticamente quantas parcelas já venceram:

```python
# Exemplo de cálculo interno
meses_passados = (ano_atual - ano_compra) * 12 + (mes_atual - mes_compra) + 1
parcelas_vencidas = min(meses_passados, total_parcelas)
```

### Status de Parcelas

- **Parcelas pagas:** Já incluídas no saldo devedor
- **Parcelas pendentes:** Ainda não venceram
- **Parcelas restantes:** Total - pagas

## 🔒 Privacidade e Segurança

### Isolamento de Dados

Cada usuário tem acesso apenas aos seus próprios dados:

- **Gastos pessoais:** Apenas o usuário vê seus gastos
- **Pagamentos pessoais:** Apenas o usuário vê seus pagamentos
- **Saldo individual:** Calculado apenas com dados próprios
- **Histórico privado:** Nenhum usuário vê dados de outros

### Acesso Administrativo

O administrador (definido em `ADMIN_ID`) tem acesso especial:

- **Relatório geral:** Visão completa de todos os usuários
- **Consulta de usuários:** Buscar dados de qualquer pessoa
- **Estatísticas globais:** Totais gerais de gastos e pagamentos
- **Gestão do sistema:** Controle total sobre os dados

### Validações de Segurança

- **Verificação de usuário:** Apenas usuários registrados podem usar
- **Validação de dados:** Verificação de tipos e valores
- **Controle de acesso:** Funções administrativas protegidas
- **Backup automático:** Dados salvos após cada operação

## 👥 Funcionalidades Administrativas

### Relatório Geral

O administrador pode acessar um relatório completo com:

- **Total de gastos:** Soma de todos os gastos vencidos
- **Total de pagamentos:** Soma de todos os pagamentos
- **Saldo geral:** Diferença entre gastos e pagamentos
- **Lista de usuários:** Todos os usuários com seus saldos
- **Estatísticas:** Números de gastos e pagamentos por usuário

### Consulta de Usuários

Funcionalidade para buscar informações específicas:

- **Busca por nome:** Encontrar usuário pelo nome
- **Busca por username:** Usar @username para buscar
- **Dados detalhados:** Saldo, fatura atual, histórico
- **Estatísticas individuais:** Totais de gastos e pagamentos

### Exemplo de Relatório

```
👥 Relatório Geral - Administrador

💳 Total em gastos: R$ 2.450,00
💰 Total em pagamentos: R$ 1.800,00
📊 Saldo geral: R$ 650,00

👥 Usuários (4):
🔴 João: R$ 250,00
💚 Maria: R$ -50,00
🔴 Pedro: R$ 300,00
⚖️ Ana: R$ 0,00
```

## 🗄️ Estrutura de Dados

### Formato do Arquivo JSON

O bot armazena dados em formato JSON estruturado:

```json
{
  "usuarios": {
    "123456789": {
      "name": "João Silva",
      "username": "joao123",
      "last_seen": 1640995200,
      "ativo": true
    }
  },
  "gastos": {
    "123456789_1640995200": {
      "id": "123456789_1640995200",
      "user_id": "123456789",
      "descricao": "Notebook",
      "valor_total": "1200.00",
      "valor_parcela": "100.00",
      "parcelas_total": 12,
      "parcelas_pagas": 3,
      "data_compra": "2024-01-15T10:30:00",
      "ativo": true,
      "mes_inicio": 1,
      "ano_inicio": 2024
    }
  },
  "pagamentos": {
    "pag_123456789_1640995300": {
      "id": "pag_123456789_1640995300",
      "user_id": "123456789",
      "valor": "150.00",
      "descricao": "Pagamento fatura",
      "data_pagamento": "2024-01-20T15:45:00",
      "mes": 1,
      "ano": 2024
    }
  },
  "configuracoes": {
    "dia_vencimento": 10,
    "mes_atual": 8,
    "ano_atual": 2024
  }
}
```

### Campos Principais

#### Usuários
- `name`: Nome completo do usuário
- `username`: Username do Telegram (opcional)
- `last_seen`: Timestamp da última interação
- `ativo`: Status do usuário (ativo/inativo)

#### Gastos
- `descricao`: Descrição da compra
- `valor_total`: Valor total da compra
- `valor_parcela`: Valor de cada parcela
- `parcelas_total`: Número total de parcelas
- `parcelas_pagas`: Parcelas já vencidas
- `mes_inicio`/`ano_inicio`: Data de início das parcelas

#### Pagamentos
- `valor`: Valor do pagamento
- `descricao`: Descrição opcional
- `data_pagamento`: Data e hora do pagamento
- `mes`/`ano`: Mês e ano do pagamento

## 💡 Exemplos Práticos

### Cenário 1: Família Compartilhando Cartão

**Situação:** Família de 4 pessoas usando o mesmo cartão.

**Participantes:**
- Carlos (Pai - Administrador)
- Ana (Mãe)
- João (Filho)
- Maria (Filha)

**Fluxo de uso:**

1. **Configuração inicial:**
   - Carlos configura o bot com seu ID como admin
   - Todos enviam `/start` para se registrar

2. **Gastos do mês:**
   ```
   Ana: [Clica "Adicionar Gasto"]
        Supermercado 250.00
   
   João: [Clica "Adicionar Gasto"]
         Tênis 180.00 3
   
   Maria: [Clica "Adicionar Gasto"]
          Livros 120.00
   ```

3. **Consulta de saldos:**
   - Ana: R$ 250,00 devedor
   - João: R$ 60,00 devedor (1ª parcela)
   - Maria: R$ 120,00 devedor

4. **Pagamentos:**
   ```
   Ana: [Clica "Registrar Pagamento"]
        250.00 Pagamento supermercado
   
   João: [Clica "Registrar Pagamento"]
         60.00 Primeira parcela tênis
   ```

5. **Relatório administrativo (Carlos):**
   ```
   👥 Relatório Geral
   💳 Total gastos: R$ 430,00
   💰 Total pagamentos: R$ 310,00
   📊 Saldo geral: R$ 120,00
   
   👥 Usuários:
   ⚖️ Ana: R$ 0,00
   🔴 João: R$ 120,00 (2 parcelas restantes)
   🔴 Maria: R$ 120,00
   ```

### Cenário 2: Grupo de Amigos

**Situação:** Grupo de amigos compartilhando cartão para viagem.

**Participantes:**
- Roberto (Administrador)
- Fernanda
- Marcos
- Patrícia

**Fluxo de uso:**

1. **Gastos da viagem:**
   ```
   Roberto: Hotel 800.00 4
   Fernanda: Passagens 1200.00 6
   Marcos: Alimentação 300.00
   Patrícia: Passeios 400.00 2
   ```

2. **Fatura do primeiro mês:**
   - Roberto: R$ 200,00 (hotel)
   - Fernanda: R$ 200,00 (passagens)
   - Marcos: R$ 300,00 (alimentação)
   - Patrícia: R$ 200,00 (passeios)

3. **Acerto de contas:**
   ```
   Fernanda: 200.00 Primeira parcela
   Marcos: 300.00 Pagamento completo
   Patrícia: 200.00 Primeira parcela
   ```

4. **Status após pagamentos:**
   - Roberto: R$ 600,00 devedor (3 parcelas restantes)
   - Fernanda: R$ 1000,00 devedor (5 parcelas restantes)
   - Marcos: R$ 0,00 quitado
   - Patrícia: R$ 200,00 devedor (1 parcela restante)

### Cenário 3: Empresa Pequena

**Situação:** Pequena empresa com cartão corporativo.

**Participantes:**
- Sandra (Gerente - Admin)
- Bruno (Vendedor)
- Carla (Marketing)
- Diego (TI)

**Fluxo de uso:**

1. **Gastos corporativos:**
   ```
   Bruno: Combustível 150.00
   Carla: Material gráfico 300.00 2
   Diego: Software 600.00 12
   Sandra: Almoço cliente 80.00
   ```

2. **Controle mensal:**
   - Cada funcionário registra seus gastos
   - Sandra monitora via relatório geral
   - Pagamentos feitos pela empresa

3. **Relatório mensal (Sandra):**
   ```
   👥 Relatório Corporativo
   💳 Total gastos: R$ 380,00
   💰 Total pagamentos: R$ 380,00
   📊 Saldo geral: R$ 0,00
   
   Detalhamento:
   • Bruno: R$ 150,00 (combustível)
   • Carla: R$ 150,00 (1ª parcela material)
   • Diego: R$ 50,00 (1ª parcela software)
   • Sandra: R$ 80,00 (almoço)
   ```

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Bot não responde

**Sintomas:**
- Mensagens não são processadas
- Menu não aparece
- Comandos ignorados

**Soluções:**
```bash
# Verificar se o bot está rodando
ps aux | grep bot_cartao_otimizado

# Verificar logs de erro
tail -f bot.log

# Reiniciar o bot
python3 bot_cartao_otimizado.py
```

#### 2. Erro de token inválido

**Sintomas:**
- Erro ao iniciar: "Invalid token"
- Bot não conecta ao Telegram

**Soluções:**
1. Verificar token no `config.py`
2. Gerar novo token no @BotFather
3. Verificar espaços extras no token

#### 3. Dados não salvam

**Sintomas:**
- Gastos/pagamentos não persistem
- Dados perdidos após reiniciar

**Soluções:**
```bash
# Verificar permissões do arquivo
ls -la cartao_data.json

# Verificar espaço em disco
df -h

# Verificar integridade do JSON
python3 -m json.tool cartao_data.json
```

#### 4. Usuário não encontrado (Admin)

**Sintomas:**
- Consulta de usuário retorna "não encontrado"
- Relatório não mostra usuários

**Soluções:**
1. Usuário deve ter enviado `/start` pelo menos uma vez
2. Verificar se o nome/username está correto
3. Verificar se o usuário está ativo

#### 5. Parcelas calculadas incorretamente

**Sintomas:**
- Valor da fatura não confere
- Parcelas não aparecem no mês correto

**Soluções:**
1. Verificar data do sistema
2. Recalcular parcelas manualmente
3. Verificar configuração de mês/ano

### Logs e Debugging

#### Habilitar Logs Detalhados

```python
# Adicionar no início do bot_cartao_otimizado.py
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('bot_debug.log'),
        logging.StreamHandler()
    ]
)
```

#### Verificar Integridade dos Dados

```python
# Script para verificar dados
import json
from decimal import Decimal

def verificar_dados():
    with open('cartao_data.json', 'r') as f:
        dados = json.load(f)
    
    print(f"Usuários: {len(dados.get('usuarios', {}))}")
    print(f"Gastos: {len(dados.get('gastos', {}))}")
    print(f"Pagamentos: {len(dados.get('pagamentos', {}))}")
    
    # Verificar consistência
    for gasto_id, gasto in dados.get('gastos', {}).items():
        if gasto['parcelas_pagas'] > gasto['parcelas_total']:
            print(f"ERRO: Gasto {gasto_id} tem mais parcelas pagas que total")

verificar_dados()
```

### Backup e Recuperação

#### Criar Backup

```bash
# Backup manual
cp cartao_data.json backup_$(date +%Y%m%d_%H%M%S).json

# Backup automático (cron)
0 2 * * * cp /path/to/cartao_data.json /path/to/backup/cartao_$(date +\%Y\%m\%d).json
```

#### Restaurar Backup

```bash
# Parar o bot
pkill -f bot_cartao_otimizado

# Restaurar dados
cp backup_20240815_120000.json cartao_data.json

# Reiniciar o bot
python3 bot_cartao_otimizado.py
```

### Monitoramento

#### Script de Monitoramento

```bash
#!/bin/bash
# monitor_bot.sh

BOT_PROCESS="bot_cartao_otimizado.py"

if ! pgrep -f "$BOT_PROCESS" > /dev/null; then
    echo "$(date): Bot não está rodando. Reiniciando..."
    cd /path/to/telegram_bot
    python3 bot_cartao_otimizado.py &
    echo "$(date): Bot reiniciado."
else
    echo "$(date): Bot está rodando normalmente."
fi
```

#### Configurar Monitoramento Automático

```bash
# Adicionar ao crontab
crontab -e

# Verificar a cada 5 minutos
*/5 * * * * /path/to/monitor_bot.sh >> /var/log/bot_monitor.log 2>&1
```

## 📞 Suporte e Contribuições

### Reportar Problemas

Para reportar bugs ou sugerir melhorias:

1. Descreva o problema detalhadamente
2. Inclua logs de erro se disponíveis
3. Mencione versão do Python e sistema operacional
4. Forneça passos para reproduzir o problema

### Contribuições

Contribuições são bem-vindas! Áreas de interesse:

- **Novas funcionalidades**: Relatórios avançados, exportação de dados
- **Melhorias de interface**: Novos botões, navegação aprimorada
- **Otimizações**: Performance, uso de memória
- **Documentação**: Exemplos, tutoriais, traduções

### Roadmap Futuro

Funcionalidades planejadas para próximas versões:

- **Exportação de dados**: PDF, Excel, CSV
- **Notificações automáticas**: Lembretes de vencimento
- **Categorização de gastos**: Organização por categorias
- **Relatórios gráficos**: Gráficos de gastos por período
- **API REST**: Integração com outros sistemas
- **Interface web**: Painel administrativo web
- **Backup na nuvem**: Sincronização automática

---

**Desenvolvido por:** Manus AI  
**Versão:** 2.0 Otimizada  
**Data:** Agosto 2024  
**Licença:** MIT

