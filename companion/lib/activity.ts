import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readState, writeState } from "./access.ts";
import { getPins } from "./study.ts";

// 04-10-2026: Omkar: "the agent should check the last update, last upload, last action, last activity
// and automatically build a persistent memory". Nothing here is written by a model: every line is a row
// that exists (an upload, a note, a question, a hearing, a paper she opened), with its date. Each read
// merges what is new into one timeline file per person, so the history outlives the rows (a test matter
// cleared, a thread deleted). It is her activity, never the record: no line is a fact from the papers.

export type Event = { key: string; at: string; matter: string | null; text: string; link?: string };
type Visit = { matter: string; doc: string; title: string; page: number; at: string };
const hash = (email: string) => createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32);
const visitsPath = (email: string) => `_system/activity/${hash(email)}.visits.json`;
const timelinePath = (email: string) => `_system/activity/${hash(email)}.timeline.json`;
const KEEP = 300;

export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-").replace(",", "");
// 06-10-2026: entries saved before the rename say "AI app"; she is never shown that word, so they are read as the new wording
const said = <T extends { text: string }>(e: T): T => ({ ...e, text: e.text.replace(/^AI app\b/, "A connected app") });
const cut = (s: string, n = 90) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** The paper page calls this after rendering: the last papers she opened, newest first, one row per paper. */
export async function noteVisit(email: string, v: Omit<Visit, "at">) {
  const xs = await readState<Visit[]>(visitsPath(email), []);
  await writeState(visitsPath(email), [{ ...v, at: new Date().toISOString() }, ...xs.filter((x) => x.doc !== v.doc)].slice(0, 30));
}
export const lastVisits = (email: string) => readState<Visit[]>(visitsPath(email), []);

/** Written the moment she (or a connected app on her behalf) does something, so memory never waits for a page to be
 *  opened. 04-10-2026: Omkar: "memory shouldn't be optional/manual, it should be persistent and autonomous". */
export async function track(email: string | null | undefined, e: { matter?: string | null; text: string; link?: string }) {
  if (!email) return;
  try {
    const at = new Date().toISOString();
    const stored = await readState<Event[]>(timelinePath(email), []);
    await writeState(timelinePath(email), merge(stored, [{ key: `act:${at}:${Math.random().toString(36).slice(2, 6)}`, at, matter: e.matter ?? null, text: cut(e.text, 140), link: e.link }]));
  } catch { /* memory must never break the action it records */ }
}

/** The stored timeline only (one storage read, no database queries): for a connected app's first message. */
export async function recentTrail(email: string, matterIds: string[], origin: string, n = 6): Promise<Event[]> {
  const xs = await readState<Event[]>(timelinePath(email), []);
  return xs.filter((e) => !e.matter || matterIds.includes(e.matter)).slice(0, n).map((e) => said({ ...e, link: absolute(e.link, origin) }));
}
const absolute = (l: string | undefined, origin: string) => (l?.startsWith("/") ? origin + l : l);

/** Fresh events from the database and her own trail, merged into the stored timeline; newest first. */
export async function activity(db: SupabaseClient, email: string, matterIds: string[], origin = ""): Promise<Event[]> {
  if (!matterIds.length) return [];
  const [matters, jobs, notes, threads, hearings, docs, visits, pins] = await Promise.all([
    db.from("matters").select("id, title").in("id", matterIds),
    db.from("ingest_jobs").select("id, matter_id, title, filename, status, doc_id, updated_at").in("matter_id", matterIds).order("updated_at", { ascending: false }).limit(8),
    db.from("annotations").select("id, matter_id, doc_id, page_no, body, quote, created_at").in("matter_id", matterIds).order("created_at", { ascending: false }).limit(8),
    db.from("qa_threads").select("id, matter_id, title, created_at").in("matter_id", matterIds).order("created_at", { ascending: false }).limit(8),
    db.from("hearings").select("id, matter_id, date, forum, purpose, status, created_at").in("matter_id", matterIds).order("created_at", { ascending: false }).limit(8),
    db.from("documents").select("id, matter_id, title, ingested_at").in("matter_id", matterIds).order("ingested_at", { ascending: false }).limit(5),
    lastVisits(email),
    getPins(email).catch(() => []),
  ]);
  const name = new Map((matters.data ?? []).map((m) => [m.id, m.title as string]));
  const docIds = [...new Set((notes.data ?? []).map((n) => n.doc_id))];
  const titles = new Map(docIds.length ? ((await db.from("documents").select("id, title").in("id", docIds)).data ?? []).map((d) => [d.id, d.title as string]) : []);
  const inM = (m: string | null) => (m && name.get(m) ? ` in ${cut(name.get(m)!, 60)}` : "");
  const page = (m: string, d: string, p?: number | null) => `${origin}/m/${m}/d/${d}${p ? `?p=${p}` : ""}`;

  const fresh: Event[] = [
    ...visits.filter((v) => matterIds.includes(v.matter)).slice(0, 8).map((v) => ({ key: `visit:${v.doc}:${v.at}`, at: v.at, matter: v.matter, text: `Opened "${cut(v.title, 70)}" at p. ${v.page}${inM(v.matter)}`, link: page(v.matter, v.doc, v.page) })),
    ...(jobs.data ?? []).map((j) => ({ key: `job:${j.id}:${j.status}`, at: j.updated_at, matter: j.matter_id, text: `Upload "${cut(j.title || j.filename, 70)}"${inM(j.matter_id)}: ${j.status === "done" ? "filed" : j.status}`, link: j.doc_id ? page(j.matter_id, j.doc_id) : undefined })),
    ...(notes.data ?? []).map((n) => ({ key: `note:${n.id}`, at: n.created_at, matter: n.matter_id, text: `Note on "${cut(titles.get(n.doc_id) ?? n.doc_id, 60)}"${n.page_no ? ` p. ${n.page_no}` : ""}: ${cut(n.body, 80)}`, link: page(n.matter_id, n.doc_id, n.page_no) })),
    ...(threads.data ?? []).map((t) => ({ key: `ask:${t.id}`, at: t.created_at, matter: t.matter_id, text: `Asked${inM(t.matter_id)}: "${cut(t.title, 90)}"`, link: `${origin}/ask?t=${t.id}` })),
    ...(hearings.data ?? []).map((h) => ({ key: `hearing:${h.id}:${h.date}:${h.status}`, at: h.created_at, matter: h.matter_id, text: `Hearing ${h.date ? h.date.split("-").reverse().join("-") : "date not set"}${h.purpose ? ` (${cut(h.purpose, 50)})` : ""}${inM(h.matter_id)}${h.status && h.status !== "upcoming" ? `, ${h.status}` : ""}`, link: `${origin}/m/${h.matter_id}/hearings` })),
    ...(docs.data ?? []).filter((d) => d.ingested_at).map((d) => ({ key: `doc:${d.id}`, at: d.ingested_at, matter: d.matter_id, text: `Paper filed: "${cut(d.title, 80)}"${inM(d.matter_id)}`, link: page(d.matter_id, d.id) })),
    ...pins.filter((p) => matterIds.includes(p.matter)).slice(0, 8).map((p) => ({ key: `pin:${p.id}`, at: p.at, matter: p.matter, text: `Pinned from "${cut(p.title, 60)}" p. ${p.page}: "${cut(p.quote, 70)}"`, link: page(p.matter, p.doc, p.page) })),
  ].filter((e) => e.at);

  const stored = await readState<Event[]>(timelinePath(email), []);
  const seen = new Set(stored.map((e) => e.key));
  const added = fresh.filter((e) => !seen.has(e.key));
  const all = merge(stored, fresh);
  if (added.length) await writeState(timelinePath(email), all).catch(() => {});
  return all.filter((e) => !e.matter || matterIds.includes(e.matter)).map((e) => said({ ...e, link: absolute(e.link, origin) }));
}

/** Newest first, one row per key (a fresh copy replaces the stored one), capped. */
export function merge(stored: Event[], fresh: Event[]): Event[] {
  const byKey = new Map<string, Event>();
  for (const e of [...stored, ...fresh]) byKey.set(e.key, e);
  return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, KEEP);
}

/** For the agent and connected connected apps: what she did last, dated, never a fact about a case. */
export function activityNote(events: Event[], n = 15): string {
  if (!events.length) return "";
  return "Where she left off (her recent activity, kept automatically from the app; NOT facts from the papers, never cite it):\n" +
    events.slice(0, n).map((e) => `- ${when(e.at)}: ${e.text}${e.link ? ` (${e.link})` : ""}`).join("\n");
}
