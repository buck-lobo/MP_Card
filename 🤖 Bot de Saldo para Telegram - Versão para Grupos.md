# 🤖 Bot de Saldo para Telegram - Versão para Grupos

Um bot avançado para Telegram que permite gerenciar saldos individuais em grupos, com sistema de transferências entre usuários e confirmação de transações.

## 🆕 Funcionalidades Exclusivas para Grupos

### 👥 **Gestão de Saldos em Grupos**
- **Saldos individuais**: Cada usuário tem seu próprio saldo em cada grupo
- **Isolamento por grupo**: Saldos são separados entre diferentes grupos
- **Registro automático**: Usuários são registrados automaticamente ao interagir
- **Persistência**: Dados mantidos entre reinicializações do bot

### 💸 **Sistema de Transferências**
- **Transferências entre usuários**: Envie valores para outros membros do grupo
- **Confirmação obrigatória**: Destinatário deve aceitar a transação
- **Validação de saldo**: Verifica se o remetente tem saldo suficiente
- **Notificações**: Ambas as partes recebem confirmação da transação

### 🔒 **Controle de Acesso Avançado**
- **Administração por grupo**: Admins podem zerar saldos do grupo específico
- **Verificação de permissões**: Controle rigoroso de acesso a funções administrativas
- **Logs de transações**: Registro de todas as operações para auditoria

## 📋 Funcionalidades Completas

### 🔧 Funcionalidades Principais
- **Soma de valores**: Adicione ou subtraia valores do seu saldo no grupo
- **Consulta de saldo**: Visualize seu saldo atual no grupo específico
- **Visualização de saldos do grupo**: Veja todos os saldos dos membros
- **Transferências**: Envie valores para outros usuários com confirmação
- **Zeragem de saldo**: Administradores podem zerar saldos individuais ou do grupo
- **Menu interativo**: Interface com botões para facilitar o uso
- **Compatibilidade**: Funciona em grupos, supergrupos e chats privados

### 💰 Comandos Disponíveis

| Comando | Descrição | Exemplo | Acesso | Contexto |
|---------|-----------|---------|--------|----------|
| `/start` | Inicia o bot e mostra menu principal | `/start` | Todos | Todos |
| `/menu` | Abre o menu interativo | `/menu` | Todos | Todos |
| `/soma <valor>` | Adiciona/subtrai valor do saldo | `/soma 15.50` | Todos | Todos |
| `/saldo` | Mostra saldo atual | `/saldo` | Todos | Todos |
| `/saldos` | Mostra saldos do grupo | `/saldos` | Todos | Grupos |
| `/transferir @user valor` | Transfere valor para usuário | `/transferir @joao 25.50` | Todos | Grupos |
| `/ajuda` | Mostra lista de comandos | `/ajuda` | Todos | Todos |
| `/zerar` | Zera saldo próprio | `/zerar` | Admin | Todos |
| `/zerar tudo` | Zera todos os saldos | `/zerar tudo` | Admin | Todos |

### 🎯 Menu Interativo para Grupos

#### Menu Principal (Grupos)
- 💰 **Adicionar Valor** - Acesso ao menu de valores
- 📊 **Ver Saldo** - Consulta rápida do saldo no grupo
- 👥 **Saldos do Grupo** - Lista todos os saldos dos membros
- 💸 **Transferir** - Instruções para transferências
- 🔄 **Zerar Meu Saldo** (Admin) - Zera saldo próprio no grupo
- 🗑️ **Zerar Grupo** (Admin) - Zera todos os saldos do grupo
- ❓ **Ajuda** - Informações específicas para grupos

#### Sistema de Confirmação
- **Solicitação**: Remetente envia pedido de transferência
- **Notificação**: Destinatário recebe botões de confirmação
- **Confirmação**: ✅ Confirmar ou ❌ Rejeitar
- **Execução**: Transferência processada automaticamente
- **Notificação**: Ambas as partes recebem confirmação final

## 🚀 Instalação e Configuração

### Pré-requisitos
- Python 3.7 ou superior
- Conta no Telegram
- Token de bot do Telegram (obtido via @BotFather)
- Permissões de administrador no grupo (opcional, para funções admin)

### Configuração do Bot

1. **Configure o arquivo `config.py`:**
   ```python
   # Token do bot (obtido do @BotFather)
   BOT_TOKEN = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
   
   # Seu ID do Telegram (obtido do @userinfobot)
   ADMIN_ID = 123456789
   
   # Arquivo para persistir os dados
   DATA_FILE = "saldo_data.json"
   ```

2. **Execute o bot para grupos:**
   ```bash
   python3 bot_grupos.py
   ```

### Adicionando o Bot ao Grupo

1. **Adicione o bot ao grupo**:
   - Abra o grupo no Telegram
   - Clique em "Adicionar membros"
   - Procure pelo username do seu bot
   - Adicione o bot ao grupo

2. **Configure permissões (opcional)**:
   - Para funções administrativas, torne o bot administrador
   - Ou configure o `ADMIN_ID` com o ID de um administrador do grupo

3. **Teste o bot**:
   - Envie `/start` no grupo
   - Verifique se o menu aparece corretamente
   - Teste comandos básicos

## 📖 Guia de Uso Detalhado

### 🎛️ Usando o Bot em Grupos

#### Primeiros Passos
1. **Adicione o bot ao grupo**
2. **Envie `/start`** para ativar o bot
3. **Explore o menu interativo** clicando nos botões
4. **Cada membro** deve interagir pelo menos uma vez para ser registrado

#### Gerenciando Seu Saldo
```
/soma 50.00     # Adiciona R$ 50,00 ao seu saldo no grupo
/soma -10.25    # Remove R$ 10,25 do seu saldo no grupo
/saldo          # Mostra seu saldo atual no grupo
```

#### Visualizando Saldos do Grupo
```
/saldos         # Lista todos os saldos dos membros do grupo
```

**Exemplo de saída:**
```
📊 Saldos do Grupo

💰 João (@joao): R$ 125,50
💰 Maria (@maria): R$ 89,75
🔴 Pedro (@pedro): R$ -15,00
💰 Ana: R$ 200,00
```

### 💸 Sistema de Transferências

#### Como Transferir
1. **Comando básico:**
   ```
   /transferir @usuario valor
   ```

2. **Exemplos práticos:**
   ```
   /transferir @maria 25.50    # Transfere R$ 25,50 para Maria
   /transferir @joao 100       # Transfere R$ 100,00 para João
   /transferir @ana -10.25     # Solicita R$ 10,25 de Ana
   ```

#### Fluxo de Confirmação

1. **Solicitação enviada:**
   ```
   💸 Solicitação de Transferência
   
   João quer transferir R$ 25,50 para Maria.
   
   @maria, você aceita esta transação?
   
   [✅ Confirmar] [❌ Rejeitar]
   ```

2. **Confirmação (se aceita):**
   ```
   ✅ Transferência confirmada!
   
   💸 João → Maria
   💰 Valor: R$ 25,50
   
   📊 Novos saldos:
   • João: R$ 74,50
   • Maria: R$ 115,25
   ```

3. **Rejeição (se rejeitada):**
   ```
   ❌ Transferência rejeitada!
   
   Maria rejeitou a transferência de R$ 25,50 de João.
   ```

#### Validações Automáticas
- **Saldo suficiente**: Verifica se o remetente tem saldo para transferir
- **Usuário válido**: Confirma se o destinatário existe e já interagiu com o bot
- **Valor válido**: Aceita apenas valores numéricos diferentes de zero
- **Auto-transferência**: Impede transferências para si mesmo

### 🔒 Funcionalidades Administrativas

#### Para Administradores do Bot
```
/zerar              # Zera apenas seu próprio saldo no grupo
/zerar tudo         # Zera todos os saldos do grupo específico
```

#### Controle de Acesso
- Apenas usuários com ID configurado em `ADMIN_ID` podem usar comandos administrativos
- Funções administrativas são isoladas por grupo
- Tentativas de acesso não autorizado são registradas

### 📱 Interface Adaptativa

#### Chat Privado vs Grupo
O bot adapta automaticamente sua interface:

**Chat Privado:**
- Menu simplificado
- Foco em saldo individual
- Sem opções de transferência

**Grupos:**
- Menu expandido
- Opções de visualização de saldos do grupo
- Sistema de transferências ativo
- Controles administrativos específicos do grupo

## 🔧 Estrutura de Dados

### 📊 Formato de Armazenamento

O bot utiliza um arquivo JSON com a seguinte estrutura:

```json
{
  "saldos": {
    "chat_id_1": {
      "user_id_1": "125.50",
      "user_id_2": "89.75",
      "user_id_3": "-15.00"
    },
    "chat_id_2": {
      "user_id_1": "200.00",
      "user_id_4": "50.25"
    }
  },
  "usuarios": {
    "user_id_1": {
      "name": "João",
      "username": "joao",
      "last_seen": 1672531200
    },
    "user_id_2": {
      "name": "Maria",
      "username": "maria",
      "last_seen": 1672531300
    }
  }
}
```

### 🔄 Isolamento por Grupo
- **Saldos separados**: Cada grupo mantém saldos independentes
- **Usuários globais**: Informações de usuário são compartilhadas
- **Transações isoladas**: Transferências só ocorrem dentro do mesmo grupo

## 🛡️ Segurança e Validações

### 🔒 Controles de Segurança
- **Validação de entrada**: Todos os valores são validados antes do processamento
- **Controle de acesso**: Funções administrativas restritas por ID
- **Isolamento de dados**: Grupos não podem acessar dados de outros grupos
- **Confirmação obrigatória**: Transferências requerem confirmação explícita

### 💾 Integridade dos Dados
- **Backup automático**: Dados salvos a cada operação
- **Recuperação de erros**: Sistema robusto de tratamento de exceções
- **Validação de tipos**: Uso de Decimal para precisão monetária
- **Logs detalhados**: Registro de todas as operações para auditoria

### ⚡ Performance e Escalabilidade
- **Carregamento eficiente**: Dados carregados apenas uma vez na inicialização
- **Salvamento otimizado**: Apenas dados modificados são salvos
- **Limitações inteligentes**: Listas de usuários limitadas para evitar spam
- **Limpeza automática**: Transações pendentes são removidas após processamento

## 🔍 Detalhes Técnicos Avançados

### 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    Bot de Saldo para Grupos                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Chat 1    │  │   Chat 2    │  │      Chat N         │  │
│  │             │  │             │  │                     │  │
│  │ User A: 100 │  │ User A: 200 │  │ User X: 50          │  │
│  │ User B: 50  │  │ User C: 150 │  │ User Y: 75          │  │
│  │ User C: 25  │  │ User D: 80  │  │ User Z: 100         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                  Sistema de Transferências                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Solicitação → Validação → Confirmação → Execução       ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                    Persistência de Dados                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ JSON File: saldos + usuarios + metadados               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 🔄 Fluxo de Transferências

```
Usuário A                    Bot                     Usuário B
    │                        │                         │
    │ /transferir @B 50      │                         │
    ├───────────────────────►│                         │
    │                        │ Validar saldo           │
    │                        │ Validar usuário         │
    │                        │ Criar transação         │
    │                        │                         │
    │                        │ Solicitação confirmação │
    │                        ├────────────────────────►│
    │                        │                         │
    │                        │      ✅ Confirmar       │
    │                        │◄────────────────────────┤
    │                        │                         │
    │                        │ Executar transferência  │
    │                        │ Atualizar saldos        │
    │                        │ Salvar dados            │
    │                        │                         │
    │ Notificação sucesso    │ Notificação sucesso     │
    │◄───────────────────────┤────────────────────────►│
```

### 📊 Gerenciamento de Estado

#### Transações Pendentes
```python
transacoes_pendentes = {
    "123_456_1672531200": {
        "remetente_id": 123,
        "remetente_nome": "João",
        "destinatario_id": 456,
        "destinatario_nome": "Maria",
        "valor": Decimal("25.50"),
        "chat_id": -789,
        "timestamp": 1672531200
    }
}
```

#### Estrutura de Usuários
```python
usuarios = {
    "123": {
        "name": "João",
        "username": "joao",
        "last_seen": 1672531200
    }
}
```

## 🐛 Solução de Problemas

### ❓ Problemas Comuns em Grupos

#### Bot não responde no grupo
- **Verificar permissões**: Certifique-se de que o bot pode enviar mensagens
- **Testar em privado**: Confirme se o bot funciona em chat privado
- **Verificar logs**: Monitore o console para erros específicos

#### Transferências não funcionam
- **Usuário não registrado**: Destinatário deve ter interagido com o bot
- **Username incorreto**: Verifique se o @ está correto
- **Saldo insuficiente**: Confirme se o remetente tem saldo suficiente

#### Saldos não aparecem
- **Interação necessária**: Usuários devem enviar pelo menos um comando
- **Dados corrompidos**: Verifique o arquivo `saldo_data.json`
- **Permissões de arquivo**: Confirme se o bot pode escrever no diretório

### 🔧 Comandos de Diagnóstico

#### Verificar Status do Bot
```bash
# Verificar se o bot está rodando
ps aux | grep bot_grupos.py

# Verificar logs em tempo real
tail -f nohup.out
```

#### Verificar Dados
```bash
# Visualizar estrutura de dados
cat saldo_data.json | python3 -m json.tool

# Backup dos dados
cp saldo_data.json backup_$(date +%Y%m%d_%H%M%S).json
```

### 📋 Checklist de Troubleshooting

1. **✅ Token configurado corretamente**
2. **✅ Bot adicionado ao grupo**
3. **✅ Usuários interagiram com o bot**
4. **✅ Permissões de escrita no diretório**
5. **✅ Arquivo de dados não corrompido**
6. **✅ Logs sem erros críticos**

## 📈 Comparação de Versões

| Funcionalidade | Versão Original | Versão Menu | Versão Grupos |
|----------------|-----------------|-------------|---------------|
| Comandos básicos | ✅ | ✅ | ✅ |
| Menu interativo | ❌ | ✅ | ✅ |
| Saldos por grupo | ❌ | ❌ | ✅ |
| Transferências | ❌ | ❌ | ✅ |
| Confirmação de transações | ❌ | ❌ | ✅ |
| Visualização de saldos do grupo | ❌ | ❌ | ✅ |
| Isolamento de dados | ❌ | ❌ | ✅ |
| Interface adaptativa | ❌ | ❌ | ✅ |

## 🎯 Casos de Uso Práticos

### 👨‍👩‍👧‍👦 Família
- **Controle de gastos**: Cada membro registra seus gastos
- **Mesada**: Pais podem transferir mesada para filhos
- **Divisão de contas**: Facilita divisão de contas domésticas

### 🏢 Trabalho
- **Caixinha do café**: Controle de contribuições
- **Almoços em grupo**: Divisão de custos de refeições
- **Eventos corporativos**: Organização de churrascos e festas

### 🎓 Estudantes
- **República**: Controle de gastos compartilhados
- **Projetos em grupo**: Divisão de custos de materiais
- **Viagens**: Organização financeira de excursões

### 🎮 Comunidades
- **Clãs de jogos**: Controle de contribuições para torneios
- **Grupos de hobby**: Divisão de custos de equipamentos
- **Eventos sociais**: Organização de encontros e festas

## 🚀 Funcionalidades Futuras

### 🔮 Roadmap de Desenvolvimento
- **Relatórios**: Exportação de histórico de transações
- **Categorias**: Classificação de gastos por categoria
- **Metas**: Definição de objetivos de economia
- **Notificações**: Alertas para saldos baixos
- **API**: Interface para integração com outros sistemas

### 💡 Sugestões de Melhorias
- **Backup automático**: Sincronização com serviços de nuvem
- **Multi-idioma**: Suporte a diferentes idiomas
- **Temas**: Personalização da interface
- **Estatísticas**: Gráficos de gastos e tendências

## 📞 Suporte e Recursos

### 🛠️ Comandos de Diagnóstico
- Use `/start` para testar conectividade básica
- Use `/menu` para verificar interface interativa
- Use `/saldos` para testar funcionalidades de grupo
- Monitore logs no console para erros

### 📚 Recursos Adicionais
- Documentação oficial: https://python-telegram-bot.readthedocs.io/
- Telegram Bot API: https://core.telegram.org/bots/api
- Guia de Grupos: https://core.telegram.org/bots/features#group-management

## 📄 Licença

Este projeto é fornecido como está, para uso pessoal e educacional.

---

**Desenvolvido com ❤️ para facilitar o gerenciamento financeiro em grupos**
**Versão para Grupos - Transferências com Confirmação e Saldos Individuais**

