import {
  handleCommandStart,
  handleCommandHelp,
  handleMessageText,
  handleCallbackQuery,
  handleCommandGasto,
  handleCommandPagamento,
  handleCommandSaldo,
  handleCommandExtrato,
  handleCommandAdminPainel,
  handleCommandAdminGastos,
  handleCommandAdminPagamentos,
  handleCommandAdminEditGasto,
  handleCommandAdminEditPagamento,
  handleCommandAdminDelGasto,
  handleCommandAdminDelPagamento,
  handleCommandCodigo,
  ensureUserAuthorized,
} from "./handlers";

export async function handleUpdate(update: any, token: string): Promise<void> {
  if (update.message) {
    const msg = update.message;
    const text: string = msg.text ?? "";

    // Primeiro, para qualquer coisa além de /start e /codigo, garantir que o usuário está autorizado
    const trimmed = text.trim();
    const isStartCommand = trimmed.startsWith("/start");
    const isCodigoCommand = trimmed.startsWith("/codigo");
    if (!isStartCommand && !isCodigoCommand) {
      const chatId = msg.chat.id;
      const user = msg.from;
      const autorizado = await ensureUserAuthorized(user, token, chatId);
      if (!autorizado) {
        return;
      }
    }

    if (text.startsWith("/")) {
      const [command, ...args] = text.trim().split(/\s+/);

      switch (command) {
        case "/start":
          await handleCommandStart(msg, token, args);
          return;
        case "/help":
          await handleCommandHelp(msg, token, args);
          return;
        case "/codigo":
          await handleCommandCodigo(msg, token, args);
          return;
        case "/gasto":
          await handleCommandGasto(msg, token, args);
          return;
        case "/pagamento":
          await handleCommandPagamento(msg, token, args);
          return;
        case "/saldo":
          await handleCommandSaldo(msg, token, args);
          return;
        case "/extrato":
          await handleCommandExtrato(msg, token, args);
          return;
        case "/admin_painel":
          await handleCommandAdminPainel(msg, token, args);
          return;
        case "/admin_gastos":
          await handleCommandAdminGastos(msg, token, args);
          return;
        case "/admin_pagamentos":
          await handleCommandAdminPagamentos(msg, token, args);
          return;
        case "/admin_edit_gasto":
          await handleCommandAdminEditGasto(msg, token, args);
          return;
        case "/admin_edit_pagamento":
          await handleCommandAdminEditPagamento(msg, token, args);
          return;
        case "/admin_del_gasto":
          await handleCommandAdminDelGasto(msg, token, args);
          return;
        case "/admin_del_pagamento":
          await handleCommandAdminDelPagamento(msg, token, args);
          return;
        default:
          await handleMessageText(msg, token);
          return;
      }
    } else {
      await handleMessageText(msg, token);
      return;
    }
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, token);
    return;
  }

  // Outros tipos de update podem ser tratados aqui
}
