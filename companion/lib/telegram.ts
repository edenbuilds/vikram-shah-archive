import { createHmac } from "node:crypto";
import { admin, readState, writeState } from "@/lib/access";

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

// Which workspace account each Telegram chat acts as: TELEGRAM_USERS ("chatid=email,...") plus
// chats linked through a personal t.me link (/start <code>), stored as a small JSON file in the
// private bucket so no schema change is needed.
const LINKS = "_system/telegram-users.json";

export async function linkedChats(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const pair of (process.env.TELEGRAM_USERS ?? "").split(",")) {
    const [id, email] = pair.split("=").map((x) => x.trim());
    if (id && email) out[id] = email.toLowerCase();
  }
  Object.assign(out, await readState<Record<string, string>>(LINKS, {}));
  return out;
}

export async function chatUser(chat: number | string): Promise<string | null> {
  return (await linkedChats())[String(chat)] ?? null;
}

// t.me start codes allow 64 chars of [A-Za-z0-9_-]: a short HMAC per email, looked up by trying
// each workspace user (there are only a few).
export const startCode = (email: string) => "c" + createHmac("sha256", process.env.COMPANION_LINK_SECRET!).update(`tg:${email.toLowerCase()}`).digest("hex").slice(0, 24);

export async function linkChat(chat: number | string, code: string): Promise<string | null> {
  const { data: users } = await admin().from("app_users").select("email");
  const email = (users ?? []).map((u) => u.email.toLowerCase()).find((e) => startCode(e) === code);
  if (!email) return null;
  const map = await linkedChats();
  map[String(chat)] = email;
  await writeState(LINKS, map);
  return email;
}
