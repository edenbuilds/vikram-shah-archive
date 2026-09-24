"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftMinutes, type Item, type Minutes } from "@/lib/minutes";
import { headers } from "next/headers";
import { admin, tokenFor } from "@/lib/access";
import { sendSignInLink } from "@/lib/signin-mail";
import { getPrefs, setPrefs } from "@/lib/prefs";
import { db, requireUser } from "@/lib/supabase";
import { DEFAULT_DISCLAIMER, TAXONOMIES } from "@/lib/taxonomies";
import { norm } from "@/lib/citations";
import { getMatter } from "@/lib/data";
import { basisOf, buildDates, getDates, getPins, pinId, saveDates, savePins } from "@/lib/study";
import { removeSkill, saveSkill } from "@/lib/skills";

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
  const { supabase } = await requireUser();
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

export async function deleteAnnotation(f: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("annotations").delete().eq("id", str(f, "id")));
  revalidatePath(`/m/${str(f, "matter")}/d/${str(f, "doc")}`);
}

export async function addToCollection(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter");
  let cid = opt(f, "collection");
  if (!cid && str(f, "new_title")) {
    cid = (must(await supabase.from("collections").insert({ matter_id: m, title: str(f, "new_title") }).select("id").single()) as { id: string }).id;
  }
  if (!cid) return;
  must(await supabase.from("collection_items").upsert({ collection_id: cid, doc_id: str(f, "doc"), page_no: num(f, "page"), note: opt(f, "note") }));
  revalidatePath(`/m/${m}/collections`);
  revalidatePath(`/m/${m}/d/${str(f, "doc")}`);
}

export async function saveCollection(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter");
  const row = { matter_id: m, title: str(f, "title"), note: opt(f, "note"), hearing_id: opt(f, "hearing") };
  const id = opt(f, "id");
  must(id ? await supabase.from("collections").update(row).eq("id", id) : await supabase.from("collections").insert(row));
  revalidatePath(`/m/${m}/collections`);
}

export async function removeFromCollection(f: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("collection_items").delete().eq("collection_id", str(f, "collection")).eq("doc_id", str(f, "doc")));
  revalidatePath(`/m/${str(f, "matter")}/collections`);
}

// ── chronology ──────────────────────────────────────────────────────────────
export async function saveEntry(f: FormData) {
  const { supabase } = await requireUser();
  const m = str(f, "matter");
  const row = {
    matter_id: m, date: opt(f, "date"), date_text: opt(f, "date_text"), title: str(f, "title"), body: opt(f, "body"),
    doc_id: opt(f, "doc"), page_no: opt(f, "doc") ? num(f, "page") : null,
  };
  const id = opt(f, "id");
  must(id ? await supabase.from("chronology_entries").update(row).eq("id", id) : await supabase.from("chronology_entries").insert(row));
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
  const { supabase } = await requireUser();
  const id = str(f, "matter");
  const title = str(f, "title");
  if (!title) return;
  must(await supabase.from("matters").update({ title, short: opt(f, "short"), forum: opt(f, "forum"), cause: opt(f, "cause") }).eq("id", id));
  revalidatePath("/", "layout");
}

// A paper's title. Documents have no update policy for members, so membership is checked
// here and the write goes through the service role. The id (and so every link) stays the same.
export async function renameDocument(f: FormData) {
  const { supabase } = await requireUser();
  const id = str(f, "doc");
  const title = str(f, "title").slice(0, 300);
  const { data: visible } = await supabase.from("documents").select("matter_id").eq("id", id).maybeSingle();
  if (!visible || !title) return;
  must(await admin().from("documents").update({ title }).eq("id", id));
  revalidatePath(`/m/${visible.matter_id}`, "layout");
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
