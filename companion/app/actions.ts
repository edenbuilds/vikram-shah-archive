"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftMinutes, type Item, type Minutes } from "@/lib/minutes";
import { headers } from "next/headers";
import { admin, memberMatters, tokenFor } from "@/lib/access";
import { sendSignInLink } from "@/lib/signin-mail";
import { getPrefs, setPrefs } from "@/lib/prefs";
import { db, requireUser } from "@/lib/supabase";
import { track } from "@/lib/activity";
import { colourTag } from "@/lib/highlight";
import { addInk, removeInk } from "@/lib/ink";
import { DEFAULT_DISCLAIMER, TAXONOMIES } from "@/lib/taxonomies";
import { norm } from "@/lib/citations";
import { getMatter } from "@/lib/data";
import { basisOf, buildDates, getDates, getPins, pinId, saveDates, savePins, saveSectionNote as saveNote } from "@/lib/study";
import { removeSkill, saveSkill } from "@/lib/skills";
import { markMoved } from "@/lib/stage-suggest";
import { editMemory, forget, remember, restore } from "@/lib/memory";
import { getControl, setMode, settle, withText, type Mode } from "@/lib/mcp-control";
import { approve, undoEntry } from "@/lib/mcp-writes";
import { correctPage, getHistory, splitMarkdown } from "@/lib/corrections";
import { deliver, dropReport, getReports, patchReport } from "@/lib/reports";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;
const num = (f: FormData, k: string) => (str(f, k) === "" ? null : Number(str(f, k)));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
const must = <T,>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

// ── auth ────────────────────────────────────────────────────────────────────
// No passwords: a one-click sign-in link goes to the address (and to her Telegram, if linked).
// The reply is the same whether or not the address has access, so nobody can probe for accounts.
export async function signIn(f: FormData) {
  const email = str(f, "email").trim().toLowerCase();
  const { data: staff } = await admin().from("app_users").select("email").eq("email", email).maybeSingle();
  if (staff) {
    const h = await headers();
    const link = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/k/${tokenFor(email)}`;
    await sendSignInLink(email, link);
  }
  redirect(`/login?sent=${encodeURIComponent(email)}`);
}

export async function signOut() {
  await (await db()).auth.signOut();
  redirect("/login");
}

// ── workspace ───────────────────────────────────────────────────────────────
// Folder / archive: arrangement only, per person. The matter must be one she can see.
export async function organiseMatter(f: FormData) {
  const { supabase, user } = await requireUser();
  const matter = str(f, "matter");
  const { data: visible } = await supabase.from("matters").select("id").eq("id", matter).maybeSingle();
  if (!visible) return;
  const p = await getPrefs(user.email!);
  const folder = str(f, "folder").trim().slice(0, 60);
  if (folder) p.folders[matter] = folder; else delete p.folders[matter];
  const act = str(f, "act");
  if (act === "archive" && !p.archived.includes(matter)) p.archived.push(matter);
  if (act === "unarchive") p.archived = p.archived.filter((x) => x !== matter);
  await setPrefs(user.email!, p);
  revalidatePath("/");
}
export async function createMatter(f: FormData) {
  const { supabase, user } = await requireUser();
  const title = str(f, "title");
  const kind = TAXONOMIES[str(f, "kind")] ? str(f, "kind") : "arbitration";
  const people = ["claimant", "respondent", "arbitrator", "opposing_counsel"].flatMap((role) =>
    str(f, role).split(/\n|;/).map((n) => n.trim()).filter(Boolean).map((name) => ({ name, role })),
  );
  const id = `${slug(title)}-${Date.now().toString(36).slice(-4)}`;
  must(await supabase.rpc("create_matter", {
    m_id: id, m_title: title, m_kind: kind, m_forum: opt(f, "forum"), m_cause: opt(f, "cause"),
    m_stages: TAXONOMIES[kind], m_disclaimer: DEFAULT_DISCLAIMER, m_people: people,
  }));
  // 2026-09-23: Arya created "Agile Real Estate v. Vikram Singh" from one account and it was
  // invisible from her other account: create_matter only adds the creator. Share with the workspace.
  const { data: staff } = await admin().from("app_users").select("email");
  await admin().from("matter_members").upsert((staff ?? []).map((u) => ({ matter_id: id, email: u.email, role: "advocate" })), { ignoreDuplicates: true });
  await track(user.email, { matter: id, text: `Created the matter "${title}"`, link: `/m/${id}` });
  redirect(`/m/${id}/upload`);
}

export async function queueUpload(input: { matter: string; stage: string; title: string; filename: string; path: string }) {
  const { supabase } = await requireUser();
  if (!input.path.startsWith(`${input.matter}/uploads/`)) throw new Error("bad upload path");
  must(await supabase.from("ingest_jobs").insert({
    matter_id: input.matter, stage: input.stage, title: input.title, filename: input.filename, storage_path: input.path,
  }));
  revalidatePath(`/m/${input.matter}/upload`);
}

// ── annotations & collections ───────────────────────────────────────────────
export async function addAnnotation(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter"), doc = str(f, "doc");
  const start = num(f, "start"), end = num(f, "end");
  let quote: string | null = null;
  if (start !== null && end !== null) {
    // The quote is re-cut from the stored transcript server-side, never taken from the client.
    const d = must(await supabase.from("documents").select("transcript").eq("id", doc).single()) as { transcript: string | null };
    quote = (d.transcript ?? "").slice(start, end) || null;
  }
  must(await supabase.from("annotations").insert({
    matter_id: m, doc_id: doc, page_no: num(f, "page"), char_start: start, char_end: end, quote,
    body: str(f, "body"), tags: str(f, "tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
  }));
  revalidatePath(`/m/${m}/d/${doc}`);
}

// A highlight drawn on the scan: the shape goes to ink.json (so the PDF export draws it as a real highlight, which
// LiquidText shows), the row makes it a note she can list, edit, delete and her connected apps can read.
export async function addHighlight(f: FormData) {
  const { supabase, user } = await requireUser();
  const m = str(f, "matter"), doc = str(f, "doc"), page = Number(str(f, "page"));
  const c = (k: string) => Math.min(Math.max(Number(str(f, k)) || 0, 0), 1);
  const [x, y] = [c("x"), c("y")], w = Math.min(c("w"), 1 - x), h = Math.min(c("h"), 1 - y);
  const { data: d } = await supabase.from("documents").select("id, page_count").eq("id", doc).eq("matter_id", m).maybeSingle();
  if (!d || !(page >= 1 && page <= d.page_count) || w < 0.005 || h < 0.003) return;
  const tag = colourTag(str(f, "color"));
  const row = must(await supabase.from("annotations").insert({ matter_id: m, doc_id: doc, page_no: page, body: "Highlight", tags: ["highlight", "drawn", tag] }).select("id").single()) as { id: string };
  await addInk(m, doc, { id: row.id, page, color: tag.slice(6), rects: [[x, y, w, h]], body: "Highlight", quote: null, tags: ["highlight"] });
  await track(user.email, { matter: m, text: `Highlighted p. ${page}`, link: `/m/${m}/d/${doc}?p=${page}` });
  revalidatePath(`/m/${m}/d/${doc}`);
}

export async function deleteAnnotation(f: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("annotations").delete().eq("id", str(f, "id")));
  if (str(f, "drawn")) await removeInk(str(f, "matter"), str(f, "doc"), str(f, "id")).catch(() => {});
  revalidatePath(`/m/${str(f, "matter")}/d/${str(f, "doc")}`);
}

export async function addToCollection(f: FormData) {
  const { supabase, user } = await requireUser();
  const m = str(f, "matter");
  let cid = opt(f, "collection");
  if (!cid && str(f, "new_title")) {
    cid = (must(await supabase.from("collections").insert({ matter_id: m, title: str(f, "new_title") }).select("id").single()) as { id: string }).id;
  }
  if (!cid) return;
  must(await supabase.from("collection_items").upsert({ collection_id: cid, doc_id: str(f, "doc"), page_no: num(f, "page"), note: opt(f, "note") }));
  await track(user.email, { matter: m, text: `Added ${num(f, "page") ? `p. ${num(f, "page")}` : "a paper"} to a collection`, link: `/m/${m}/collections` });
  revalidatePath(`/m/${m}/collections`);
  revalidatePath(`/m/${m}/d/${str(f, "doc")}`);
}

export async function saveCollection(f: FormData) {
  const { supabase, user } = await requireUser();
  const m = str(f, "matter");
  const row = { matter_id: m, title: str(f, "title"), note: opt(f, "note"), hearing_id: opt(f, "hearing") };
  const id = opt(f, "id");
  must(id ? await supabase.from("collections").update(row).eq("id", id) : await supabase.from("collections").insert(row));
  await track(user.email, { matter: m, text: `${id ? "Edited" : "Started"} the collection "${row.title}"`, link: `/m/${m}/collections` });
  revalidatePath(`/m/${m}/collections`);
}

export async function removeFromCollection(f: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("collection_items").delete().eq("collection_id", str(f, "collection")).eq("doc_id", str(f, "doc")));
  revalidatePath(`/m/${str(f, "matter")}/collections`);
}

// ── chronology ──────────────────────────────────────────────────────────────
export async function saveEntry(f: FormData) {
  const { supabase, user } = await requireUser();
  const m = str(f, "matter");
  const row = {
    matter_id: m, date: opt(f, "date"), date_text: opt(f, "date_text"), title: str(f, "title"), body: opt(f, "body"),
    doc_id: opt(f, "doc"), page_no: opt(f, "doc") ? num(f, "page") : null,
  };
  const id = opt(f, "id");
  must(id ? await supabase.from("chronology_entries").update(row).eq("id", id) : await supabase.from("chronology_entries").insert(row));
  await track(user.email, { matter: m, text: `${id ? "Edited" : "Added"} a chronology entry: "${row.title}"`, link: `/m/${m}/chronology` });
  revalidatePath(`/m/${m}/chronology`);
  revalidatePath(`/m/${m}/chronology/papers`);
}

export async function deleteEntry(f: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("chronology_entries").delete().eq("id", str(f, "id")));
  revalidatePath(`/m/${str(f, "matter")}/chronology`);
}

export async function moveEntry(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter");
  const list = must(await supabase.from("chronology_entries").select("id").eq("matter_id", m)
    .order("date", { nullsFirst: false }).order("sort").order("created_at")) as { id: string }[];
  const i = list.findIndex((e) => e.id === str(f, "id"));
  const j = i + (str(f, "dir") === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // ponytail: rewrites every sort value of the matter; fine for hundreds of entries.
  await Promise.all(list.map((e, k) => supabase.from("chronology_entries").update({ sort: k * 10 }).eq("id", e.id)));
  revalidatePath(`/m/${m}/chronology`);
}

// ── hearings & minutes ──────────────────────────────────────────────────────
export async function saveHearing(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter");
  const row = { matter_id: m, date: str(f, "date"), forum: opt(f, "forum"), purpose: opt(f, "purpose"),
    status: str(f, "status") === "held" ? "held" : "upcoming", minutes_doc_id: opt(f, "minutes_doc") };
  const id = opt(f, "id");
  const saved = must(id
    ? await supabase.from("hearings").update(row).eq("id", id).select("id").single()
    : await supabase.from("hearings").insert(row).select("id").single()) as { id: string };
  revalidatePath(`/m/${m}/hearings`);
  redirect(`/m/${m}/hearings/${saved.id}`);
}

export async function saveNotes(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter"), h = str(f, "hearing");
  // Editing the raw capture re-opens review: nothing unreviewed counts as final.
  must(await supabase.from("hearing_notes").upsert(
    { hearing_id: h, matter_id: m, raw: String(f.get("raw") ?? ""), reviewed_by_advocate: false, reviewed_at: null, updated_at: new Date().toISOString() },
    { onConflict: "hearing_id" },
  ));
  revalidatePath(`/m/${m}/hearings/${h}`);
}

export async function draftFromNotes(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter"), h = str(f, "hearing");
  const n = must(await supabase.from("hearing_notes").select("raw").eq("hearing_id", h).single()) as { raw: string };
  if (!n.raw.trim()) return;
  const { draft, dropped } = await draftMinutes(n.raw);
  must(await supabase.from("hearing_notes").update({
    draft: { ...draft, dropped }, drafted_by: "ai", reviewed_by_advocate: false, reviewed_at: null, updated_at: new Date().toISOString(),
  }).eq("hearing_id", h));
  revalidatePath(`/m/${m}/hearings/${h}`);
}

// The advocate's confirmation is the only path by which minutes become "final" and feed
// the chronology (and a next hearing). Their edits replace the draft outright.
export async function confirmMinutes(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter"), h = str(f, "hearing");
  const hearing = must(await supabase.from("hearings").select("date, forum").eq("id", h).single()) as { date: string; forum: string | null };
  const lines = (k: string): Item[] => str(f, k).split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, source_quote: "" }));
  const nextIso = opt(f, "next_date");
  const minutes: Minutes = {
    attendees: lines("attendees"), orders: lines("orders"), action_items: lines("action_items"),
    next_date: nextIso ? { text: nextIso, iso: nextIso, source_quote: "" } : null,
  };
  must(await supabase.from("hearing_notes").update({
    draft: minutes, drafted_by: "advocate", reviewed_by_advocate: true, reviewed_at: new Date().toISOString(),
  }).eq("hearing_id", h));
  must(await supabase.from("hearings").update({ status: "held" }).eq("id", h));
  must(await supabase.from("chronology_entries").delete().eq("hearing_id", h));
  const entries = minutes.orders.map((o, i) => ({ matter_id: m, date: hearing.date, title: `Hearing: ${o.text}`, hearing_id: h, sort: i }));
  if (nextIso) entries.push({ matter_id: m, date: hearing.date, title: `Next date fixed: ${nextIso}`, hearing_id: h, sort: entries.length });
  if (entries.length) must(await supabase.from("chronology_entries").insert(entries));
  if (nextIso) {
    const exists = must(await supabase.from("hearings").select("id").eq("matter_id", m).eq("date", nextIso)) as unknown[];
    if (!exists.length) must(await supabase.from("hearings").insert({ matter_id: m, date: nextIso, forum: hearing.forum, status: "upcoming" }));
  }
  revalidatePath(`/m/${m}/hearings`);
  revalidatePath(`/m/${m}/chronology`);
  revalidatePath(`/m/${m}/hearings/${h}`);
}

// ── Q&A ─────────────────────────────────────────────────────────────────────

// ── renaming ────────────────────────────────────────────────────────────────
// Matter details: members may update their matter (RLS "edit" policy).
export async function updateMatter(f: FormData) {
  const { supabase, user } = await requireUser();
  const id = str(f, "matter");
  const title = str(f, "title");
  if (!title) return;
  must(await supabase.from("matters").update({ title, short: opt(f, "short"), forum: opt(f, "forum"), cause: opt(f, "cause") }).eq("id", id));
  await track(user.email, { matter: id, text: `Edited the matter details of "${title}"`, link: `/m/${id}` });
  revalidatePath("/", "layout");
}

// A paper's title. Documents have no update policy for members, so membership is checked
// here and the write goes through the service role. The id (and so every link) stays the same.
export async function renameDocument(f: FormData) {
  const { supabase, user } = await requireUser();
  const id = str(f, "doc");
  const title = str(f, "title").slice(0, 300);
  const { data: visible } = await supabase.from("documents").select("matter_id").eq("id", id).maybeSingle();
  if (!visible || !title) return;
  must(await admin().from("documents").update({ title }).eq("id", id));
  await track(user.email, { matter: visible.matter_id, text: `Renamed a paper to "${title}"`, link: `/m/${visible.matter_id}/d/${id}` });
  revalidatePath(`/m/${visible.matter_id}`, "layout");
}

// A paper moves only to one of its own matter's stages. Records whether she took the Jev suggestion.
export async function moveDocument(f: FormData) {
  const { supabase, user } = await requireUser();
  const id = str(f, "doc"), to = str(f, "stage");
  const { data: visible } = await supabase.from("documents").select("matter_id").eq("id", id).maybeSingle();
  if (!visible) return;
  const m = await getMatter(supabase, visible.matter_id);
  if (!m.stages.some((s) => s.id === to)) return;
  must(await admin().from("documents").update({ stage: to }).eq("id", id));
  await markMoved(visible.matter_id, id, to).catch(() => {});
  await track(user.email, { matter: visible.matter_id, text: `Moved a paper to "${m.stages.find((s) => s.id === to)?.title ?? to}"`, link: `/m/${visible.matter_id}/d/${id}` });
  revalidatePath(`/m/${visible.matter_id}`, "layout");
}

// Corrections to the read text (lib/corrections.ts): anyone who can see the paper; the scan stays the record.
async function visiblePaper(id: string) {
  const { supabase, user } = await requireUser();
  const { data: d } = await supabase.from("documents").select("id, matter_id, page_count").eq("id", id).maybeSingle();
  return d ? { d, by: user.email!.toLowerCase() } : null;
}

export async function correctPageText(f: FormData) {
  const v = await visiblePaper(str(f, "doc"));
  const page = Number(str(f, "page"));
  if (!v || !(page >= 1 && page <= v.d.page_count)) return;
  await correctPage(admin(), v.d, page, String(f.get("text") ?? ""), { by: v.by, reason: opt(f, "reason"), via: "web" });
  await track(v.by, { matter: v.d.matter_id, text: `Corrected the read text of p. ${page}`, link: `/m/${v.d.matter_id}/d/${v.d.id}?p=${page}` });
  revalidatePath(`/m/${v.d.matter_id}`, "layout");
}

export async function revertPageText(f: FormData) {
  const v = await visiblePaper(str(f, "doc"));
  const page = Number(str(f, "page"));
  const h = v && (await getHistory(v.d.id))[page];
  if (!v || !h) return;
  await correctPage(admin(), v.d, page, h.original, { by: v.by, reason: "put back the text first read", via: "revert" });
  revalidatePath(`/m/${v.d.matter_id}`, "layout");
}

// The Markdown download, edited anywhere and uploaded back: only pages whose text changed are saved.
export async function uploadCorrectedMarkdown(f: FormData): Promise<{ ok: boolean; message: string }> {
  const v = await visiblePaper(str(f, "doc"));
  const file = f.get("file");
  if (!v || !(file instanceof File) || !file.size) return { ok: false, message: "Choose the edited Markdown file." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, message: "That file is over 20 MB." };
  const pages = splitMarkdown(await file.text());
  if (!pages.size) return { ok: false, message: "No \"## Page N\" headings found. Edit the Markdown download and keep its page headings." };
  const outside = [...pages.keys()].filter((n) => n < 1 || n > v.d.page_count);
  if (outside.length) return { ok: false, message: `This paper has ${v.d.page_count} pages; the file has page ${outside[0]}. Nothing was saved.` };
  let saved = 0;
  for (const [n, text] of pages) if ((await correctPage(admin(), v.d, n, text, { by: v.by, reason: opt(f, "reason") ?? `uploaded ${file.name}`, via: "markdown" })) === "saved") saved++;
  revalidatePath(`/m/${v.d.matter_id}`, "layout");
  return { ok: true, message: saved ? `Saved ${saved} corrected page${saved === 1 ? "" : "s"}. The original text is kept and can be put back page by page.` : "No page text changed." };
}

// Her own note under one part of the explainer or brief: stored beside the receipted text, never inside it.
export async function saveSectionNote(f: FormData) {
  const { supabase, user } = await requireUser();
  const m = str(f, "matter"), kind = str(f, "kind") === "brief" ? "brief" : "explainer";
  await getMatter(supabase, m);  // throws unless she can see the matter
  await saveNote(m, kind, str(f, "key").slice(0, 40), str(f, "text").slice(0, 4000));
  await track(user.email, { matter: m, text: `Wrote her own note on the ${kind}`, link: `/m/${m}/${kind}` });
  revalidatePath(`/m/${m}/${kind}`);
}

export async function editAnnotation(f: FormData) {
  const { supabase, user } = await requireUser();
  const m = str(f, "matter"), doc = str(f, "doc"), body = str(f, "body");
  if (!body) return;
  must(await supabase.from("annotations").update({ body }).eq("id", str(f, "id")));
  await track(user.email, { matter: m, text: `Edited a note: "${body}"`, link: `/m/${m}/d/${doc}` });
  revalidatePath(`/m/${m}/d/${doc}`);
}

// Her memory (lib/memory.ts): a matter-specific item only for a matter she can see.
export async function saveMemory(f: FormData) {
  const { supabase, user } = await requireUser();
  const email = user.email!.toLowerCase(), id = str(f, "id"), text = str(f, "text"), matter = opt(f, "matter");
  if (id) await editMemory(email, id, text);
  else {
    if (matter && !(await supabase.from("matters").select("id").eq("id", matter).maybeSingle()).data) return;
    await remember(email, text, matter, "web");
  }
  revalidatePath("/settings");
}

export async function deleteMemory(id: string) {
  const { user } = await requireUser();
  await forget(user.email!.toLowerCase(), id);
  revalidatePath("/settings");
}

// ── study aids: pins and the dates in the record ────────────────────────────
// A pin is only saved if its quote is really on that page (checked with her own client, so RLS
// also decides whether she may see the paper at all). Pinning the same receipt again unpins it.
export async function togglePin(p: { matter: string; doc: string; page: number; quote: string }): Promise<{ ok: boolean; pinned: boolean }> {
  const { supabase, user } = await requireUser();
  const quote = String(p.quote ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
  const id = pinId(p.doc, p.page, quote);
  const pins = await getPins(user.email!);
  if (pins.some((x) => x.id === id)) {
    await savePins(user.email!, pins.filter((x) => x.id !== id));
    revalidatePath("/pins");
    return { ok: true, pinned: false };
  }
  // a search passage can run onto the next page, so look at that one too and pin the page it is on
  const [{ data: pages }, { data: doc }] = await Promise.all([
    supabase.from("document_pages").select("page_no, text").eq("doc_id", p.doc).gte("page_no", p.page).lte("page_no", p.page + 1).order("page_no"),
    supabase.from("documents").select("title, matter_id").eq("id", p.doc).maybeSingle(),
  ]);
  const on = (pages ?? []).find((x) => norm(x.text ?? "").includes(norm(quote)));
  if (!on || !doc || quote.length < 4) return { ok: false, pinned: false };
  await savePins(user.email!, [{ id, matter: doc.matter_id, doc: p.doc, title: doc.title, page: on.page_no, quote, at: new Date().toISOString() }, ...pins]);
  revalidatePath("/pins");
  return { ok: true, pinned: true };
}

export async function unpin(f: FormData) {
  const { user } = await requireUser();
  await savePins(user.email!, (await getPins(user.email!)).filter((x) => x.id !== str(f, "id")));
  revalidatePath("/pins");
}

export async function rebuildDates(f: FormData) {
  const { supabase } = await requireUser();
  const matter = str(f, "matter");
  await getMatter(supabase, matter); // her access, before the service-role write
  await saveDates(matter, await buildDates(supabase, matter));
  revalidatePath(`/m/${matter}/chronology/papers`);
}

export async function keepDates(f: FormData) {
  const { supabase } = await requireUser();
  const matter = str(f, "matter");
  await getMatter(supabase, matter);
  const d = await getDates(matter);
  if (d) await saveDates(matter, { ...d, ack: await basisOf(supabase, matter) });
  revalidatePath(`/m/${matter}/chronology/papers`);
}

// ── her skills ──────────────────────────────────────────────────────────────
// Markdown only, read by the connected apps as instructions; nothing in a skill runs on the server.
export async function addSkill(files: Record<string, string>): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { user } = await requireUser();
  try {
    const s = await saveSkill(files, user.email!);
    revalidatePath("/settings");
    return { ok: true, name: s.name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteSkill(name: string) {
  await requireUser();
  await removeSkill(name);
  revalidatePath("/settings");
}

// ── problem reports (lib/reports.ts): anyone signed in can mark one fixed, resend its mail or delete it ──
export async function setReportFixed(id: string, fixed: boolean) {
  await requireUser();
  await patchReport(id, { fixed: fixed ? new Date().toISOString() : null });
  revalidatePath("/settings");
}
export async function resendReport(id: string): Promise<string> {
  await requireUser();
  const r = (await getReports()).find((x) => x.id === id);
  if (!r) return "failed";
  const h = await headers(), mail = await deliver(r, `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`);
  revalidatePath("/settings");
  return mail;
}
export async function deleteReport(id: string) {
  await requireUser();
  await dropReport(id);
  revalidatePath("/settings");
}

// ── what connected connected apps may do (lib/mcp-control.ts) ─────────────────────
export async function setMcpMode(mode: Mode) {
  const { user } = await requireUser();
  if (mode !== "review" && mode !== "allow" && mode !== "off") return;
  await setMode(user.email!.toLowerCase(), mode);
  revalidatePath("/settings");
}
// Approve a waiting change, with her edit of its words if she made one. Returns an error line, or null when it was applied.
export async function approveChange(id: string, edited?: string): Promise<string | null> {
  const { user } = await requireUser();
  const email = user.email!.toLowerCase(), c = await getControl(email), p = c.proposals.find((x) => x.id === id);
  if (!p) return "That change is no longer waiting.";
  if (p.w.tool !== "remember" && p.w.tool !== "forget" && !(await memberMatters(email)).includes(p.w.matter)) return "You no longer have access to that matter.";
  const err = await approve(email, c, id, edited === undefined ? p.w : withText(p.w, edited));
  revalidatePath("/settings");
  return err;
}
export async function declineChange(id: string) {
  const { user } = await requireUser();
  await settle(user.email!.toLowerCase(), id, { status: "declined" });
  revalidatePath("/settings");
}
export async function undoChange(id: string) {
  const { user } = await requireUser();
  const email = user.email!.toLowerCase(), e = (await getControl(email)).log.find((x) => x.id === id);
  if (e) await undoEntry(email, e);
  revalidatePath("/settings");
}
export async function restoreMemory(id: string) {
  const { user } = await requireUser();
  await restore(user.email!.toLowerCase(), id);
  revalidatePath("/settings");
}
