# 🤖 Bot de Saldo para Telegram - Versão com Menu Interativo

Um bot completo e intuitivo para Telegram que permite aos usuários gerenciar saldos com interface interativa através de botões e menus personalizados.

## 🆕 Novidades da Versão com Menu

### 🎛️ Interface Interativa
- **Botões clicáveis**: Navegue sem digitar comandos
- **Menu principal**: Acesso rápido a todas as funcionalidades
- **Valores pré-definidos**: Botões para valores comuns (R$ 5, 10, 20, 50, 100, 200)
- **Menu de comandos**: Lista organizada ao digitar `/`

### 🚀 Experiência Aprimorada
- **Navegação intuitiva**: Botões "Voltar" em todas as telas
- **Feedback visual**: Emojis e formatação melhorada
- **Ações rápidas**: Adicione valores com um clique
- **Compatibilidade**: Funciona tanto com botões quanto com comandos tradicionais

## 📋 Funcionalidades Completas

### 🔧 Funcionalidades Principais
- **Soma de valores**: Adicione ou subtraia valores do seu saldo
- **Consulta de saldo**: Visualize seu saldo atual a qualquer momento
- **Zeragem de saldo**: Administradores podem zerar saldos individuais ou todos os saldos
- **Persistência de dados**: Os dados são salvos automaticamente em arquivo JSON
- **Controle de acesso**: Funcionalidades administrativas restritas por ID
- **Menu interativo**: Interface com botões para facilitar o uso
- **Valores rápidos**: Botões para valores pré-definidos

### 💰 Comandos Disponíveis

| Comando | Descrição | Exemplo | Acesso |
|---------|-----------|---------|--------|
| `/start` | Inicia o bot e mostra menu principal | `/start` | Todos |
| `/menu` | Abre o menu interativo | `/menu` | Todos |
| `/ajuda` | Mostra lista de comandos | `/ajuda` | Todos |
| `/soma <valor>` | Adiciona/subtrai valor do saldo | `/soma 15.50` | Todos |
| `/saldo` | Mostra saldo atual | `/saldo` | Todos |
| `/zerar` | Zera saldo próprio | `/zerar` | Admin |
| `/zerar tudo` | Zera todos os saldos | `/zerar tudo` | Admin |

### 🎯 Menu Interativo

#### Menu Principal
- 💰 **Adicionar Valor** - Acesso ao menu de valores
- 📊 **Ver Saldo** - Consulta rápida do saldo
- 🔄 **Zerar Meu Saldo** (Admin) - Zera saldo próprio
- 🗑️ **Zerar Todos** (Admin) - Zera todos os saldos
- ❓ **Ajuda** - Informações e comandos

#### Menu de Valores
- **Valores Positivos**: +R$ 5, 10, 20, 50, 100, 200
- **Valores Negativos**: -R$ 5, 10, 20
- **Valor Personalizado**: Para valores específicos
- **Voltar**: Retorna ao menu principal

## 🚀 Instalação e Configuração

### Pré-requisitos
- Python 3.7 ou superior
- Conta no Telegram
- Token de bot do Telegram (obtido via @BotFather)

### Passo 1: Obter Token do Bot

1. Abra o Telegram e procure por `@BotFather`
2. Envie o comando `/newbot`
3. Escolha um nome para seu bot
4. Escolha um username (deve terminar com "bot")
5. Copie o token fornecido

### Passo 2: Obter seu ID do Telegram

1. Procure por `@userinfobot` no Telegram
2. Envie `/start` para o bot
3. Copie seu ID numérico

### Passo 3: Configurar o Projeto

1. **Clone ou baixe os arquivos do projeto**
2. **Instale as dependências:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure o arquivo `config.py`:**
   ```python
   # Token do bot (obtido do @BotFather)
   BOT_TOKEN = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
   
   # Seu ID do Telegram (obtido do @userinfobot)
   ADMIN_ID = 123456789
   
   # Arquivo para persistir os dados
   DATA_FILE = "saldo_data.json"
   ```

### Passo 4: Executar o Bot

**Versão com Menu Interativo (Recomendada):**
```bash
python3 bot_com_menu.py
```

**Versão Original (Apenas Comandos):**
```bash
python3 bot.py
```

## 📖 Guia de Uso

### 🎛️ Usando o Menu Interativo

#### Iniciando
1. Envie `/start` para o bot
2. Clique nos botões do menu principal
3. Navegue usando os botões "Voltar"

#### Adicionando Valores Rapidamente
1. Clique em "💰 Adicionar Valor"
2. Escolha um valor pré-definido
3. Ou clique em "💬 Valor Personalizado" para usar `/soma`

#### Consultando Saldo
1. Clique em "📊 Ver Saldo" no menu principal
2. Ou use o comando `/saldo`

### 📝 Usando Comandos Tradicionais

#### Adicionando Valores
```
/soma 10.50    # Adiciona R$ 10,50 ao saldo
/soma -5.25    # Remove R$ 5,25 do saldo
/soma 100      # Adiciona R$ 100,00 ao saldo
```

#### Consultando Saldo
```
/saldo         # Mostra seu saldo atual
```

### 🔒 Para Administradores

#### Zerando Saldos (Menu)
1. Use os botões "🔄 Zerar Meu Saldo" ou "🗑️ Zerar Todos"
2. Disponível apenas no menu principal para administradores

#### Zerando Saldos (Comandos)
```
/zerar         # Zera apenas seu próprio saldo
/zerar tudo    # Zera todos os saldos do sistema
```

## 🔧 Estrutura do Projeto

```
telegram_bot/
├── bot.py                      # Versão original (apenas comandos)
├── bot_com_menu.py            # Versão com menu interativo
├── config.py                  # Configurações do bot
├── config_exemplo.py          # Exemplo de configuração
├── requirements.txt           # Dependências Python
├── instalar.sh               # Script de instalação
├── README.md                 # Documentação original
├── README_com_menu.md        # Esta documentação
├── configurar_menu_comandos.md # Instruções do menu de comandos
└── saldo_data.json           # Dados persistidos (criado automaticamente)
```

## 🎨 Interface e Experiência do Usuário

### 🎯 Design do Menu

#### Cores e Emojis
- 💰 Verde/Dourado para valores e saldo
- 📊 Azul para consultas e informações
- 🔄 Laranja para ações de reset
- ❌ Vermelho para erros e negações
- ✅ Verde para confirmações

#### Navegação
- **Hierárquica**: Menu principal → Submenus → Ações
- **Consistente**: Botão "🔙 Voltar" em todas as telas
- **Intuitiva**: Ícones descritivos e textos claros

### 📱 Responsividade

#### Adaptação ao Telegram
- **Botões otimizados**: Tamanho ideal para toque
- **Texto legível**: Formatação clara e organizada
- **Feedback imediato**: Confirmações visuais das ações

## 🛡️ Segurança e Controle

### 🔒 Controle de Acesso
- Apenas o usuário configurado como `ADMIN_ID` pode usar comandos administrativos
- Cada usuário tem acesso apenas ao próprio saldo
- Tentativas de acesso não autorizado são registradas
- Verificação de permissões tanto no menu quanto nos comandos

### 💾 Persistência de Dados
- Os dados são salvos automaticamente em arquivo JSON
- Backup automático a cada operação
- Recuperação automática em caso de erro
- Integridade dos dados mantida entre reinicializações

## 🔍 Detalhes Técnicos

### 📦 Dependências
- `python-telegram-bot`: Biblioteca oficial para bots do Telegram
- `decimal`: Para cálculos precisos com valores monetários

### 🏗️ Arquitetura do Menu

```
┌─────────────────┐
│  Menu Principal │
└─────────┬───────┘
          │
    ┌─────▼─────┐    ┌─────────────┐    ┌─────────────┐
    │ Adicionar │    │ Ver Saldo   │    │ Ajuda       │
    │ Valor     │    │             │    │             │
    └─────┬─────┘    └─────────────┘    └─────────────┘
          │
    ┌─────▼─────┐
    │ Menu de   │
    │ Valores   │
    └───────────┘
```

### 🔄 Fluxo de Callbacks

```python
# Exemplo de callback para adicionar valor
callback_data = "valor_10"  # Adiciona R$ 10,00
↓
callback_handler() processa
↓
saldo_bot.adicionar_valor(user_id, 10)
↓
Atualiza interface com novo saldo
```

### 🎛️ Configuração Automática de Comandos

O bot configura automaticamente o menu de comandos do Telegram usando a API:

```python
comandos = [
    BotCommand("start", "Iniciar o bot e ver menu principal"),
    BotCommand("menu", "Abrir menu interativo"),
    BotCommand("soma", "Adicionar valor ao saldo"),
    # ... outros comandos
]
await application.bot.set_my_commands(comandos)
```

## 🐛 Solução de Problemas

### ❓ Problemas Comuns

#### Bot não responde
- Verifique se o token está correto no `config.py`
- Confirme se o bot está executando sem erros
- Teste enviando `/start` para o bot

#### Menu não aparece
- Verifique se está usando `bot_com_menu.py`
- Confirme se a biblioteca `python-telegram-bot` está atualizada
- Teste o comando `/menu` manualmente

#### Botões não funcionam
- Verifique logs no console para erros de callback
- Confirme se o bot tem permissões adequadas
- Teste reiniciar o bot

#### Erro de permissão no comando `/zerar`
- Verifique se o `ADMIN_ID` está configurado corretamente
- Confirme seu ID do Telegram usando `@userinfobot`
- Teste com comandos antes de usar o menu

### 📊 Logs e Diagnóstico

O bot registra automaticamente:
- Todas as operações de saldo
- Erros de callback e comandos
- Tentativas de acesso não autorizado
- Problemas de persistência de dados

### 🔧 Manutenção

#### Backup dos Dados
```bash
cp saldo_data.json saldo_data_backup_$(date +%Y%m%d).json
```

#### Atualizações
1. Pare o bot (Ctrl+C)
2. Substitua os arquivos
3. Reinicie com `python3 bot_com_menu.py`

## 📈 Comparação de Versões

| Funcionalidade | Versão Original | Versão com Menu |
|----------------|-----------------|-----------------|
| Comandos básicos | ✅ | ✅ |
| Persistência de dados | ✅ | ✅ |
| Controle de admin | ✅ | ✅ |
| Menu interativo | ❌ | ✅ |
| Valores pré-definidos | ❌ | ✅ |
| Navegação por botões | ❌ | ✅ |
| Menu de comandos (/) | ❌ | ✅ |
| Interface aprimorada | ❌ | ✅ |

## 🎯 Recomendações de Uso

### 👥 Para Usuários Finais
- **Use a versão com menu** para melhor experiência
- **Explore os botões** antes de usar comandos
- **Aproveite os valores rápidos** para operações comuns

### 🔧 Para Administradores
- **Configure o ADMIN_ID** corretamente
- **Monitore os logs** para identificar problemas
- **Faça backups regulares** dos dados

### 🚀 Para Desenvolvedores
- **Estude o código** para entender a implementação
- **Personalize os valores** pré-definidos conforme necessário
- **Adicione novas funcionalidades** seguindo o padrão existente

## 📞 Suporte e Recursos

### 🛠️ Comandos de Diagnóstico
- Use `/start` para testar conectividade básica
- Use `/menu` para verificar interface interativa
- Monitore logs no console para erros
- Verifique o arquivo `saldo_data.json` para dados corrompidos

### 📚 Recursos Adicionais
- Documentação oficial: https://python-telegram-bot.readthedocs.io/
- Telegram Bot API: https://core.telegram.org/bots/api
- Guia de InlineKeyboards: https://core.telegram.org/bots/2-0-intro#inline-keyboards

## 📄 Licença

Este projeto é fornecido como está, para uso pessoal e educacional.

---

**Desenvolvido com ❤️ para facilitar o gerenciamento de saldos no Telegram**
**Versão com Menu Interativo - Experiência Aprimorada**

