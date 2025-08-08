# 🎛️ Configuração do Menu de Comandos do Telegram

## Configuração Automática

O bot agora configura automaticamente o menu de comandos quando é iniciado. Você verá os comandos disponíveis quando digitar `/` no chat com o bot.

## Configuração Manual (Opcional)

Se por algum motivo a configuração automática não funcionar, você pode configurar manualmente através do @BotFather:

### Passo a Passo:

1. **Abra o Telegram e procure por `@BotFather`**

2. **Envie o comando `/setcommands`**

3. **Selecione seu bot da lista**

4. **Cole o texto abaixo exatamente como está:**

```
start - Iniciar o bot e ver menu principal
menu - Abrir menu interativo
soma - Adicionar valor ao saldo (ex: /soma 10.50)
saldo - Ver saldo atual
ajuda - Ver ajuda e comandos disponíveis
zerar - Zerar saldo (apenas administradores)
```

5. **Envie a mensagem**

6. **O BotFather confirmará que os comandos foram configurados**

## Resultado

Após a configuração, quando os usuários digitarem `/` no chat com seu bot, verão uma lista organizada dos comandos disponíveis com suas descrições.

## Menu de Comandos vs Menu Interativo

- **Menu de Comandos (/)**: Lista tradicional que aparece ao digitar `/`
- **Menu Interativo**: Botões clicáveis que facilitam a navegação
- **Ambos funcionam juntos**: Os usuários podem escolher como preferem interagir

## Verificação

Para verificar se os comandos estão configurados:
1. Abra o chat com seu bot
2. Digite `/`
3. Você deve ver a lista de comandos com descrições

