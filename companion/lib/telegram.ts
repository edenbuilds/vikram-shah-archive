import { createHmac } from "node:crypto";

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(api(method), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json() as Promise<{ ok: boolean; result?: any; description?: string }>;
}

export const say = (chat_id: number | string, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Webhook path secret and Telegram's secret-token header, both derived from the link secret.
export const hookSecret = () => createHmac("sha256", process.env.COMPANION_LINK_SECRET!).update("telegram-webhook").digest("hex").slice(0, 40);

// Which workspace account each allowed Telegram chat acts as: "chatid=email,chatid=email".
export function chatUser(chat: number | string): string | null {
  for (const pair of (process.env.TELEGRAM_USERS ?? "").split(",")) {
    const [id, email] = pair.split("=").map((s) => s.trim());
    if (id && email && id === String(chat)) return email.toLowerCase();
  }
  return null;
}
