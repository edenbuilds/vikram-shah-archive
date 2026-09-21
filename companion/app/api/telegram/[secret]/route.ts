import { after } from "next/server";
import { admin, memberMatters, tokenFor } from "@/lib/access";
import { runAgent } from "@/lib/agent";
import { resolveScope } from "@/lib/scope";
import { chatUser, esc, hookSecret, linkChat, say, tg } from "@/lib/telegram";

export const maxDuration = 300;

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
  // /start <code> from a personal t.me link connects this chat to that workspace account
  const start = String(u.message?.text ?? "").match(/^\/start\s+(c[0-9a-f]{24})$/);
  if (start) {
    const who = await linkChat(chat, start[1]);
    await say(chat, who ? `Connected to Case Companion as ${who}. Send /help to see what I can do.` : "That link isn't valid. Open Settings in your workspace and tap Connect Telegram.");
    console.log(`telegram link ${chat} -> ${who ?? "invalid"}`);
    return Response.json({ ok: true });
  }
  const email = await chatUser(chat);
  console.log(`telegram update chat=${chat} user=${email ?? "unlinked"} kind=${u.callback_query ? "button" : u.message?.document ? "document" : u.message?.photo ? "photo" : "text"}`);
  if (!email) {
    await say(chat, "This is a private assistant. If you have access, open Settings in your workspace and tap Connect Telegram.");
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
  const ddmmyyyy = (d: string) => d.split("-").reverse().join("-");
  // Granola-style capture: append to the hearing's raw notes (time-stamped, IST); review re-opens.
  async function addNote(hearing: string, matter: string, note: string, replyTo?: number) {
    const { data: cur } = await db.from("hearing_notes").select("raw").eq("hearing_id", hearing).maybeSingle();
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const uid = users?.users.find((x) => x.email?.toLowerCase() === email)?.id;
    const stamp = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
    const raw = `${cur?.raw ? `${cur.raw.trimEnd()}\n` : ""}[${stamp}] ${note}`;
    const { error } = await db.from("hearing_notes").upsert({ hearing_id: hearing, matter_id: matter, raw, reviewed_by_advocate: false, reviewed_at: null, updated_at: new Date().toISOString(), created_by: uid }, { onConflict: "hearing_id" });
    if (error) return say(chat, `Couldn't save the note: ${esc(error.message)}`);
    const { data: h } = await db.from("hearings").select("date").eq("id", hearing).single();
    return say(chat, `Saved to the notes for the ${ddmmyyyy(h?.date ?? "")} hearing in <b>${esc(title(matter))}</b>.`, {
      reply_to_message_id: replyTo, reply_markup: { inline_keyboard: [[{ text: "Open notes and draft minutes", url: `${origin}/m/${matter}/hearings/${hearing}` }]] } });
  }

  // Button pressed: file the document this keyboard was attached to.
  if (u.callback_query) {
    const cb = u.callback_query;
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    const [kind, mid] = String(cb.data ?? "").split(":");
    if (kind === "hn") {
      const { data: h } = await db.from("hearings").select("id, matter_id").eq("id", mid).maybeSingle();
      const note = String(cb.message.reply_to_message?.text ?? "").replace(/^\/note(@\S+)?\s*/i, "").trim();
      if (!h || !ids.includes(h.matter_id) || !note) return say(chat, "I couldn't find that note. Send /note again, please.");
      await tg("editMessageText", { chat_id: chat, message_id: cb.message.message_id, text: "Saving the note…" });
      return addNote(h.id, h.matter_id, note, cb.message.reply_to_message?.message_id);
    }
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

  const raw: string = (m.text ?? "").trim();
  if (!raw) return;
  // the button bar sends its labels as text
  const text = ({ "My matters": "/matters", "Processing": "/status", "Hearing note": "/note", "Help": "/help" } as Record<string, string>)[raw] ?? raw;
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*/, "");
  if (cmd === "/start" || cmd === "/help") {
    return say(chat, [
      "<b>Case Companion</b>",
      "<b>File a paper:</b> send a PDF or a photo of a page, pick the matter, and I'll tell you when it's ready.",
      "<b>Ask:</b> type a question in plain words. Name a paper (\"the Shetty withdrawal application\") to ask only that paper. Every answer has quotes, page links and the page scans, or says it isn't in the papers. Reply to an answer to follow up.",
      "<b>Hearing note:</b> /note followed by your note adds it to that hearing's notes, ready to turn into minutes in the app.",
      "",
      "/matters · /status · /note · /link",
    ].join("\n\n"), { reply_markup: { keyboard: [[{ text: "My matters" }, { text: "Processing" }], [{ text: "Hearing note" }, { text: "Help" }]], resize_keyboard: true, is_persistent: true } });
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
  if (cmd === "/note") {
    const note = text.replace(/^\/note(@\S+)?\s*/i, "").trim();
    if (!note) return say(chat, "Send <b>/note</b> followed by your note, e.g. <i>/note Adjourned to 14-10-2026; R2 to file reply in two weeks</i>. It goes into that hearing's notes for you to turn into minutes.");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const { data: hs } = await db.from("hearings").select("id, matter_id, date").in("matter_id", ids).gte("date", today).order("date").limit(6);
    if (!hs?.length) return say(chat, "No upcoming hearing is recorded. Add the hearing in the app first, then send the note again.");
    if (hs.length === 1) return addNote(hs[0].id, hs[0].matter_id, note, m.message_id);
    return say(chat, "Which hearing is this note for?", { reply_to_message_id: m.message_id,
      reply_markup: { inline_keyboard: hs.map((h) => [{ text: `${ddmmyyyy(h.date)} · ${title(h.matter_id).slice(0, 45)}`, callback_data: `hn:${h.id}` }]) } });
  }
  if (cmd === "/link") {
    const t = tokenFor(email);
    return say(chat, `<b>Sign in (no password)</b>\n${origin}/k/${t}\n\n<b>App connection (ChatGPT, Claude, Cursor…)</b>\n<code>${origin}/api/mcp/${t}</code>\nSetup steps: ${origin}/settings\n\nKeep both private.`);
  }

  // Anything else: a question. Work out which papers she means (a named paper, a matter, or a
  // reply to an earlier answer), then the same agent as the Ask button answers from only those,
  // with receipts: quotes, page links, and the page scans themselves.
  const context = m.reply_to_message?.text ?? m.reply_to_message?.caption ?? "";
  const typing = setInterval(() => tg("sendChatAction", { chat_id: chat, action: "typing" }), 4500);
  await tg("sendChatAction", { chat_id: chat, action: "typing" });
  try {
    const scope = await resolveScope(db, text, context, ids);
    const r = await runAgent(db, text, { matterIds: scope.matterIds, docIds: scope.docIds }, context ? [{ q: "(earlier in this chat)", a: context.slice(0, 2000) }] : [], () => {});
    const head = `<b>Sources:</b> ${esc(scope.label.slice(0, 300))}`;
    if (r.status !== "answered") return say(chat, `${head}\n\nNot found in these papers. Nothing is filled in from outside them.`, { reply_to_message_id: m.message_id });
    const { data: docs } = await db.from("documents").select("id, title, matter_id").in("id", [...new Set(r.claims.flatMap((c) => c.citations.map((q) => q.doc_id)))]);
    const out = r.claims.map((c) => `${esc(c.text)}\n${c.citations.map((q) => {
      const d = docs?.find((x) => x.id === q.doc_id);
      return `<i>"${esc(q.quote.replace(/\s+/g, " ").slice(0, 300))}"</i>\n<a href="${origin}/m/${d?.matter_id}/d/${q.doc_id}?p=${q.page_start}">${esc(d?.title ?? q.doc_id)}, p. ${q.page_start}</a>`;
    }).join("\n")}`).join("\n\n");
    const first = r.claims[0]?.citations[0];
    const firstDoc = docs?.find((x) => x.id === first?.doc_id);
    await say(chat, `${head}\n\n${out.slice(0, 3700)}\n\n<i>Every quote was checked against the page. Reply to this message to follow up on the same papers.</i>`, {
      reply_to_message_id: m.message_id,
      reply_markup: { inline_keyboard: [[
        ...(first && firstDoc ? [{ text: "Open the first page", url: `${origin}/m/${firstDoc.matter_id}/d/${first.doc_id}?p=${first.page_start}` }] : []),
        { text: "Ask on the site", url: `${origin}/ask?${new URLSearchParams({ ...(scope.matterIds.length === 1 ? { m: scope.matterIds[0] } : {}), ...(scope.docIds ? { src: scope.docIds.join(",") } : {}) })}` },
      ]] },
    });

    // the receipts themselves: up to 4 page scans, captioned with paper and page
    const pages = [...new Map(r.claims.flatMap((c) => c.citations).map((q) => [`${q.doc_id}#${q.page_start}`, q])).values()].slice(0, 4);
    const media = [];
    for (const q of pages) {
      const d = docs?.find((x) => x.id === q.doc_id);
      const { data: pg } = await db.from("document_pages").select("jpeg_path").eq("doc_id", q.doc_id).eq("page_no", q.page_start).maybeSingle();
      const { data: mt } = await db.from("matters").select("storage_base").eq("id", d?.matter_id ?? "").maybeSingle();
      if (!pg) continue;
      const url = pg.jpeg_path.startsWith(`${d?.matter_id}/`) || !mt?.storage_base
        ? (await db.storage.from("companion").createSignedUrl(pg.jpeg_path, 600)).data?.signedUrl
        : `${mt.storage_base}/${pg.jpeg_path}`;
      if (url) media.push({ type: "photo", media: url, caption: `${d?.title ?? q.doc_id}, p. ${q.page_start}`.slice(0, 1000) });
    }
    if (media.length) await tg("sendMediaGroup", { chat_id: chat, media });
  } finally {
    clearInterval(typing);
  }
}
