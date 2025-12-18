"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callTelegram = callTelegram;
exports.sendMessage = sendMessage;
exports.answerCallbackQuery = answerCallbackQuery;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function callTelegram(token, method, payload) {
    var _a;
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await (0, node_fetch_1.default)(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const text = await response.text();
        console.error("Telegram API HTTP error", response.status, text);
        throw new Error(`Telegram API HTTP error: ${response.status}`);
    }
    const data = (await response.json());
    if (!data.ok) {
        console.error("Telegram API error", data);
        throw new Error(`Telegram API error: ${(_a = data.description) !== null && _a !== void 0 ? _a : "unknown error"}`);
    }
    return data.result;
}
function sendMessage(token, chatId, text, options = {}) {
    return callTelegram(token, "sendMessage", Object.assign({ chat_id: chatId, text }, options));
}
function answerCallbackQuery(token, callbackQueryId, options = {}) {
    return callTelegram(token, "answerCallbackQuery", Object.assign({ callback_query_id: callbackQueryId }, options));
}
//# sourceMappingURL=api.js.map