"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUpdate = handleUpdate;
const handlers_1 = require("./handlers");
async function handleUpdate(update, token) {
    var _a;
    if (update.message) {
        const msg = update.message;
        const text = (_a = msg.text) !== null && _a !== void 0 ? _a : "";
        // Primeiro, para qualquer coisa além de /start e /codigo, garantir que o usuário está autorizado
        const trimmed = text.trim();
        const isStartCommand = trimmed.startsWith("/start");
        const isCodigoCommand = trimmed.startsWith("/codigo");
        if (!isStartCommand && !isCodigoCommand) {
            const chatId = msg.chat.id;
            const user = msg.from;
            const autorizado = await (0, handlers_1.ensureUserAuthorized)(user, token, chatId);
            if (!autorizado) {
                return;
            }
        }
        if (text.startsWith("/")) {
            const [command, ...args] = text.trim().split(/\s+/);
            switch (command) {
                case "/start":
                    await (0, handlers_1.handleCommandStart)(msg, token, args);
                    return;
                case "/help":
                    await (0, handlers_1.handleCommandHelp)(msg, token, args);
                    return;
                case "/codigo":
                    await (0, handlers_1.handleCommandCodigo)(msg, token, args);
                    return;
                case "/gasto":
                    await (0, handlers_1.handleCommandGasto)(msg, token, args);
                    return;
                case "/pagamento":
                    await (0, handlers_1.handleCommandPagamento)(msg, token, args);
                    return;
                case "/saldo":
                    await (0, handlers_1.handleCommandSaldo)(msg, token, args);
                    return;
                case "/extrato":
                    await (0, handlers_1.handleCommandExtrato)(msg, token, args);
                    return;
                case "/admin_painel":
                    await (0, handlers_1.handleCommandAdminPainel)(msg, token, args);
                    return;
                case "/admin_gastos":
                    await (0, handlers_1.handleCommandAdminGastos)(msg, token, args);
                    return;
                case "/admin_pagamentos":
                    await (0, handlers_1.handleCommandAdminPagamentos)(msg, token, args);
                    return;
                case "/admin_edit_gasto":
                    await (0, handlers_1.handleCommandAdminEditGasto)(msg, token, args);
                    return;
                case "/admin_edit_pagamento":
                    await (0, handlers_1.handleCommandAdminEditPagamento)(msg, token, args);
                    return;
                case "/admin_del_gasto":
                    await (0, handlers_1.handleCommandAdminDelGasto)(msg, token, args);
                    return;
                case "/admin_del_pagamento":
                    await (0, handlers_1.handleCommandAdminDelPagamento)(msg, token, args);
                    return;
                default:
                    await (0, handlers_1.handleMessageText)(msg, token);
                    return;
            }
        }
        else {
            await (0, handlers_1.handleMessageText)(msg, token);
            return;
        }
    }
    if (update.callback_query) {
        await (0, handlers_1.handleCallbackQuery)(update.callback_query, token);
        return;
    }
    // Outros tipos de update podem ser tratados aqui
}
//# sourceMappingURL=router.js.map