import fetch from "node-fetch";

export async function callTelegram(
  token: string,
  method: string,
  payload: Record<string, unknown>
) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Telegram API HTTP error", response.status, text);
    throw new Error(`Telegram API HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as any;
  if (!data.ok) {
    console.error("Telegram API error", data);
    throw new Error(`Telegram API error: ${data.description ?? "unknown error"}`);
  }

  return data.result;
}

export function sendMessage(
  token: string,
  chatId: number | string,
  text: string,
  options: Record<string, unknown> = {}
) {
  return callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}

export function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  options: Record<string, unknown> = {}
) {
  return callTelegram(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...options,
  });
}
