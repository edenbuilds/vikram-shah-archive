import { after } from "next/server";
import { admin, memberMatters, tokenFor } from "@/lib/access";
import { answer } from "@/lib/qa";
import { chatUser, esc, hookSecret, say, tg } from "@/lib/telegram";

export const maxDuration = 60;

// @arya_case_archivebot. Private: only chats listed in TELEGRAM_USERS get a reply.
// Send a file -> pick the matter -> it is queued exactly like a web upload; the worker reports
// back here and by email when the papers are filed. Any other text is a question to the papers.
const MAX_BOT_FILE = 20 * 1024 * 1024; // Telegram's limit for files a bot may download

export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (secret !== hookSecret() || req.headers.get("x-telegram-bot-api-secret-token") !== hookSecret()) return new Response("no", { status: 403 });
  const u = await req.json();
  const origin = new URL(req.url).origin;
  const msg = u.message ?? u.callback_query?.message;
  const chat = msg?.chat?.id;
  if (!chat) return Response.json({ ok: true });
  const email = chatUser(chat);
  if (!email) {
    await say(chat, "This is a private assistant. Ask the workspace owner for access.");
    return Response.json({ ok: true });
  }
  after(() => handle(u, chat, email, origin).catch((e) => say(chat, `Something went wrong: ${esc(String(e?.message ?? e))}`)));
  return Response.json({ ok: true });
}

async function handle(u: any, chat: number, email: string, origin: string) {
  const db = admin();
  const ids = await memberMatters(email);
  const { data: matters } = await db.from("matters").select("id, title").in("id", ids).order("created_at");
  const title = (id: string) => matters?.find((m) => m.id === id)?.title ?? id;

  // Button pressed: file the document this keyboard was attached to.
  if (u.callback_query) {
    const cb = u.callback_query;
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    const [kind, mid] = String(cb.data ?? "").split(":");
    if (kind === "no") return tg("editMessageText", { chat_id: chat, message_id: cb.message.message_id, text: "Not filed." });
    if (kind !== "up" || !ids.includes(mid)) return;
    const src = cb.message.reply_to_message;
    const f = src?.document ?? src?.photo?.[src.photo.length - 1];
    if (!f) return say(chat, "I couldn't find the file. Send it again, please.");
    const name: string = src.document?.file_name ?? `photo-${src.message_id}.jpg`;
    if ((f.file_size ?? 0) > MAX_BOT_FILE) {
      return tg("editMessageText", { chat_id: chat, message_id: cb.message.message_id, parse_mode: "HTML",
        text: `<b>${esc(name)}</b> is ${(f.file_size / 1e6).toFixed(1)} MB. Telegram only lets bots fetch files up to 20 MB, so please upload this one on the website (any size works there):\n${origin}/m/${mid}/upload` });
    }
    await tg("editMessageText", { chat_id: chat, message_id: cb.message.message_id, text: `Uploading ${name} to ${title(mid)}…` });
    const info = await tg("getFile", { file_id: f.file_id });
    const bytes = new Uint8Array(await (await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`)).arrayBuffer());
    const path = `${mid}/uploads/${crypto.randomUUID()}-${name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    const up = await db.storage.from("companion").upload(path, bytes, { contentType: src.document?.mime_type ?? "image/jpeg" });
    if (up.error) return say(chat, `Upload failed: ${esc(up.error.message)}`);
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const uid = users?.users.find((x) => x.email?.toLowerCase() === email)?.id;
    const cleanTitle = (src.caption?.trim() || name.replace(/\.[a-z0-9]+$/i, "")).slice(0, 200);
    const { error } = await db.from("ingest_jobs").insert({ matter_id: mid, stage: "other", title: cleanTitle, filename: name, storage_path: path, created_by: uid });
    if (error) return say(chat, `Couldn't queue it: ${esc(error.message)}`);
    return tg("editMessageText", { chat_id: chat, message_id: cb.message.message_id, parse_mode: "HTML",
      text: `Queued <b>${esc(name)}</b> for <b>${esc(title(mid))}</b>.\nI'll message you here (and by email) when it's read and filed. If it's a volume with an index, it will be split into its papers.` });
  }

  const m = u.message;
  // A file: ask which matter before doing anything.
  if (m.document || m.photo) {
    return say(chat, "Which matter is this for?", {
      reply_to_message_id: m.message_id,
      reply_markup: { inline_keyboard: [...(matters ?? []).map((x) => [{ text: x.title.slice(0, 60), callback_data: `up:${x.id}` }]), [{ text: "Cancel", callback_data: "no:" }]] },
    });
  }

  const text: string = (m.text ?? "").trim();
  if (!text) return;
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*/, "");
  if (cmd === "/start" || cmd === "/help") {
    return say(chat, [
      "<b>Case Companion</b>",
      "Send me a PDF or a photo of a page and I'll file it in the right matter, then tell you when it's ready.",
      "Ask me anything about your papers in plain words; I answer only with exact quotes and page links, or tell you it isn't in the papers.",
      "",
      "/matters: your matters", "/status: what's being processed", "/link: your sign-in link and AI connection",
    ].join("\n"));
  }
  if (cmd === "/matters") {
    const { data: ds } = await db.from("documents").select("matter_id, page_count").in("matter_id", ids);
    return say(chat, (matters ?? []).map((x) => {
      const d = (ds ?? []).filter((y) => y.matter_id === x.id);
      return `<b>${esc(x.title)}</b>\n${d.length} papers, ${d.reduce((a, y) => a + y.page_count, 0)} pages\n${origin}/m/${x.id}`;
    }).join("\n\n") || "No matters yet.");
  }
  if (cmd === "/status") {
    const { data: js } = await db.from("ingest_jobs").select("title, matter_id, status, pages_done, page_count, error").in("matter_id", ids).order("created_at", { ascending: false }).limit(6);
    return say(chat, (js ?? []).map((j) => `• <b>${esc(j.title)}</b> (${esc(title(j.matter_id))}): ${j.status === "done" ? "filed" : j.status}${j.status === "processing" && j.page_count ? ` ${j.pages_done}/${j.page_count} pages` : ""}${j.error ? `\n  ${esc(j.error.slice(0, 200))}` : ""}`).join("\n") || "Nothing uploaded yet.");
  }
  if (cmd === "/link") {
    const t = tokenFor(email);
    return say(chat, `<b>Sign in (no password)</b>\n${origin}/k/${t}\n\n<b>AI connection (ChatGPT, Claude, Cursor…)</b>\n<code>${origin}/api/mcp/${t}</code>\nSetup steps: ${origin}/connect\n\nKeep both private.`);
  }

  // Anything else: a question to the papers, answered only with verified quotes.
  await tg("sendChatAction", { chat_id: chat, action: "typing" });
  const r = await answer(db, text, ids);
  if (r.status !== "answered") return say(chat, "Not found in the papers on file.");
  const { data: docs } = await db.from("documents").select("id, title, matter_id").in("id", [...new Set(r.claims.flatMap((c) => c.citations.map((q) => q.doc_id)))]);
  const out = r.claims.map((c) => `${esc(c.text)}\n${c.citations.map((q) => {
    const d = docs?.find((x) => x.id === q.doc_id);
    return `— <i>"${esc(q.quote.replace(/\s+/g, " ").slice(0, 300))}"</i>\n<a href="${origin}/m/${d?.matter_id}/d/${q.doc_id}?p=${q.page_start}">${esc(d?.title ?? q.doc_id)}, p. ${q.page_start}</a>`;
  }).join("\n")}`).join("\n\n");
  return say(chat, `${out.slice(0, 3900)}\n\n<i>Every quote was checked against the page.</i>`);
}
