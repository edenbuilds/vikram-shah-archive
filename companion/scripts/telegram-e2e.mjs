// End-to-end Telegram test in a linked chat, through the real webhook and the real Bot API.
//   node --env-file=.env.local scripts/telegram-e2e.mjs <chat_id>
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
const chat = Number(process.argv[2]);
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = createHmac("sha256", process.env.COMPANION_LINK_SECRET).update("telegram-webhook").digest("hex").slice(0, 40);
const hook = `https://case-companion.edenbuilds.me/api/telegram/${secret}`;
const post = (update) => fetch(hook, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: Date.now(), ...update }) }).then((r) => r.status);
const msg = (id, text, extra = {}) => ({ message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, text, ...extra } });
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const step = (n, t) => console.log(`\n[${n}] ${t}`);

step(1, "/help"); console.log("   webhook", await post(msg(9001, "/help"))); await wait(4);
step(2, "question naming a paper"); console.log("   webhook", await post(msg(9002, "In the Shetty withdrawal application, why is the appeal being withdrawn?"))); await wait(45);
step(3, "follow-up as a reply"); console.log("   webhook", await post(msg(9003, "And what exactly does the prayer ask the Tribunal to do?",
  { reply_to_message: { message_id: 9100, chat: { id: chat, type: "private" }, date: 0, text: "Sources: Application seeking withdrawal of the appeal, dated 17.09.2026\n\nThe application states that the appeal is being withdrawn because of the Review Order dated 09.07.2026." } }))); await wait(45);

step(4, "file: bot sends a one-page PDF, then the matter picker, then queue");
const fd = new FormData(); fd.append("chat_id", String(chat)); fd.append("caption", "Test file for the filing check (goes to the test folder)");
fd.append("document", new Blob([readFileSync(process.argv[3])], { type: "application/pdf" }), "Kuval letter test.pdf");
const sent = await (await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: fd })).json();
console.log("   sendDocument ok:", sent.ok);
const doc = { ...sent.result, chat: { id: chat, type: "private" } };
console.log("   webhook (document)", await post({ message: doc })); await wait(5);
const before = new Date().toISOString();
console.log("   webhook (picked zz-upload-test)", await post({ callback_query: { id: "e2e", data: "up:zz-upload-test", message: { message_id: 1, chat: { id: chat, type: "private" }, date: 0, reply_to_message: doc } } }));
console.log("   queued-after:", before);

step(5, "/link"); await wait(10); console.log("   webhook", await post(msg(9005, "/link")));
