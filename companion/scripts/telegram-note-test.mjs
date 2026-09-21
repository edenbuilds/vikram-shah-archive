// Telegram: button bar, a question, and a hearing note through the real webhook.
//   node --env-file=.env.local scripts/telegram-note-test.mjs <chat_id> <hearing_id>
import { createHmac } from "node:crypto";
const [chat, hearing] = [Number(process.argv[2]), process.argv[3]];
const secret = createHmac("sha256", process.env.COMPANION_LINK_SECRET).update("telegram-webhook").digest("hex").slice(0, 40);
const post = (u) => fetch(`https://case-companion.edenbuilds.me/api/telegram/${secret}`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: Date.now(), ...u }) }).then((r) => r.status);
const c = { id: chat, type: "private" };
const msg = (id, text) => ({ message_id: id, date: Math.floor(Date.now() / 1000), chat: c, text });
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
console.log("help (button bar)", await post({ message: msg(9201, "Help") })); await wait(4);
console.log("button: My matters", await post({ message: msg(9202, "My matters") })); await wait(4);
console.log("question", await post({ message: msg(9203, "patil writ exhibit K - what did the high court order say?") })); await wait(50);
const note = msg(9204, "/note Test note from the check: adjourned; reply to be filed in two weeks.");
console.log("/note", await post({ message: note })); await wait(5);
console.log("pick hearing", await post({ callback_query: { id: "n1", data: `hn:${hearing}`, message: { message_id: 1, chat: c, date: 0, reply_to_message: note } } })); await wait(8);
const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/hearing_notes?select=raw,reviewed_by_advocate&hearing_id=eq.${hearing}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }).then((x) => x.json());
console.log("saved note:", JSON.stringify(r));
