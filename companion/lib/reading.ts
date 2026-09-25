import type { SupabaseClient } from "@supabase/supabase-js";
import { readState, writeState } from "./access.ts";
import { isSpan, unsupportedFigures } from "./citations.ts";
import { AGENT_MODEL } from "./agent.ts";
import { llm } from "./ai.ts";
import { basisOf, datesIn, type Basis } from "./study.ts";

// Chronological reading order, after Arya's reading-order-chronological-md skill (24-09-2026):
// every paper by its own date, with What it is / What it says / What it sets up / Importance,
// and the papers the record mentions that are not on file. Her skill's "Implication" is strategy;
// here it is only what the paper itself directs or sets in motion, quoted, because the app states
// nothing without a receipt. Each paper is read once and kept, so after an upload only the new
// papers are read (a full matter is ~140 model calls; one new paper is one).

export type Field = { text: string; page: number; quote: string } | null;
export type Entry = {
  doc: string; title: string; iso: string | null; printed: string | null;
  what: Field; says: Field; sets: Field; importance: "Essential" | "High" | "Medium" | "Skim";
  mentions: { name: string; page: number; quote: string }[];
};
export type Needed = { tier: "Critical" | "Needed to file the next step" | "Lower priority"; item: string; doc: string; page: number; quote: string };
export type ReadingOrder = { made_at: string; basis: Basis; ack?: Basis; entries: Entry[]; needed: Needed[]; left: number };

const at = (m: string) => `_system/study/${m}/reading.json`;
export const getReading = (m: string) => readState<ReadingOrder | null>(at(m), null);
export const saveReading = (m: string, r: ReadingOrder) => writeState(at(m), r);
export const TIERS = ["Critical", "Needed to file the next step", "Lower priority"] as const;

async function json<T>(instructions: string, input: string, schema: object): Promise<T> {
  const out = await llm<{ output?: { content?: { text?: string }[] }[] }>("responses", {
    model: AGENT_MODEL, instructions, input, reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name: "out", strict: true, schema } },
  });
  const text = out.output?.flatMap((o: { content?: { text?: string }[] }) => o.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  return JSON.parse(text ?? "") as T;
}

const FIELD = { type: "object", additionalProperties: false, required: ["text", "page", "quote"],
  properties: { text: { type: "string" }, page: { type: "integer" }, quote: { type: "string" } } };
const PAPER = {
  type: "object", additionalProperties: false,
  required: ["date_as_printed", "what", "says", "sets", "importance", "mentions"],
  properties: {
    date_as_printed: { type: ["string", "null"] }, what: FIELD, says: FIELD, sets: { anyOf: [FIELD, { type: "null" }] },
    importance: { type: "string", enum: ["Essential", "High", "Medium", "Skim"] },
    mentions: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "page", "quote"],
      properties: { name: { type: "string" }, page: { type: "integer" }, quote: { type: "string" } } } },
  },
};
const RULES = `You read one legal paper from an Indian court record and describe it for a chronological reading order.
Use only the page text given. Every field carries the page number and a verbatim quote (8 to 40 words, copied exactly) that supports it.
- date_as_printed: the paper's own date (execution, order, filing or letter date) exactly as printed, or null if it has none. Not a date it merely mentions.
- what: one plain line: the kind of paper, who made it (party or authority), its date.
- says: the load-bearing content: operative direction, finding, prayer, figure or date.
- sets: only what this paper itself directs or sets in motion (next date, compliance, time to reply, the order it challenges), or null. No strategy, no assessment, no theory.
- importance: a reading priority. Essential only for the few papers that carry the case (the main pleading, the impugned or final order); Skim for covering letters, receipts, vakalatnamas.
- mentions: other documents this paper refers to by name or date (agreements, deeds, letters, orders, applications), each with its quote. At most 12.
Never add facts from general knowledge.`;

type Page = { page_no: number; text: string | null };
/** One paper's reading entry, every field checked against the page it cites; a field that fails is dropped. */
export async function readPaper(db: SupabaseClient, d: { id: string; title: string; page_count: number | null }): Promise<Entry> {
  const n = d.page_count ?? 1;
  const [{ data: head }, { data: tail }] = await Promise.all([
    db.from("document_pages").select("page_no, text").eq("doc_id", d.id).lte("page_no", 6).order("page_no"),
    db.from("document_pages").select("page_no, text").eq("doc_id", d.id).gte("page_no", Math.max(7, n - 1)).order("page_no"),
  ]);
  const pages = [...(head ?? []), ...(tail ?? [])] as Page[];
  const text = new Map(pages.map((p) => [p.page_no, p.text ?? ""]));
  const input = `Paper: ${d.title} (${n} pages)\n\n` + pages.map((p) => `[Page ${p.page_no}]\n${(p.text ?? "").slice(0, 3500)}`).join("\n\n");
  const out = await json<{ date_as_printed: string | null; what: Field; says: Field; sets: Field; importance: Entry["importance"]; mentions: Entry["mentions"] }>(RULES, input, PAPER);

  const all = pages.map((p) => p.text ?? "").join("\n");
  const ok = (f: Field): Field => {
    const src = f && text.get(f.page);
    return f && src && isSpan(f.quote, src) && !unsupportedFigures(f.text, all + " " + d.title).length ? f : null;
  };
  // the heading date must be printed on these pages, and must parse; otherwise the paper is undated
  const hit = out.date_as_printed && all.includes(out.date_as_printed) ? datesIn(out.date_as_printed)[0] : undefined;
  return {
    doc: d.id, title: d.title, iso: hit?.iso ?? null, printed: hit ? out.date_as_printed : null,
    what: ok(out.what), says: ok(out.says), sets: ok(out.sets), importance: out.importance,
    mentions: out.mentions.filter((m) => { const src = text.get(m.page); return !!src && isSpan(m.quote, src); }).slice(0, 12),
  };
}

/** Which mentioned documents are not on file, tiered. Each item keeps the mention's quote as its receipt. */
async function stillNeeded(entries: Entry[]): Promise<Needed[]> {
  const list = entries.flatMap((e) => e.mentions.map((m) => ({ ...m, doc: e.doc, from: e.title }))).slice(0, 400);
  if (!list.length) return [];
  const onFile = entries.map((e) => `- ${e.title}${e.printed ? ` (${e.printed})` : ""}`).join("\n");
  const mentioned = list.map((m, i) => `${i}. ${m.name} (mentioned in ${m.from})`).join("\n");
  const out = await json<{ items: { index: number; tier: Needed["tier"] }[] }>(
    "You compare the documents mentioned in a legal record against the papers on file. Return only mentions whose document is NOT among the papers on file " +
    "(judge by name and date; if unsure, leave it out). One item per distinct missing document. Tier: Critical if the case turns on it (the agreement, deed or order in dispute), " +
    "Needed to file the next step if a pending step needs it, otherwise Lower priority. Never add a document that is not in the mentioned list.",
    `Papers on file:\n${onFile}\n\nMentioned documents:\n${mentioned}`,
    { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["index", "tier"], properties: { index: { type: "integer" }, tier: { type: "string", enum: [...TIERS] } } } } } });
  const seen = new Set<number>();
  return out.items.filter((x) => list[x.index] && !seen.has(x.index) && seen.add(x.index))
    .map((x) => ({ tier: x.tier, item: list[x.index].name, doc: list[x.index].doc, page: list[x.index].page, quote: list[x.index].quote }));
}

/** Read the papers not yet in the reading order (all of them when `redo`), 12 at a time, saving as it goes
 *  so a run cut short by the 300 s limit resumes where it stopped. */
export async function buildReading(db: SupabaseClient, matter: string, redo: boolean, note: (s: string) => void, budgetMs = 240_000): Promise<ReadingOrder> {
  const t0 = Date.now();
  const [{ data: docs }, prev, basis] = await Promise.all([
    db.from("documents").select("id, title, page_count").eq("matter_id", matter), redo ? null : getReading(matter), basisOf(db, matter)]);
  const ids = new Set((docs ?? []).map((d) => d.id));
  const kept = (prev?.entries ?? []).filter((e) => ids.has(e.doc));
  const todo = (docs ?? []).filter((d) => !kept.some((e) => e.doc === d.id));
  const entries = [...kept];
  const order = () => entries.sort((a, b) => (a.iso ?? "9999").localeCompare(b.iso ?? "9999") || a.title.localeCompare(b.title));
  let r: ReadingOrder = { made_at: new Date().toISOString(), basis, entries, needed: prev?.needed ?? [], left: todo.length };
  for (let i = 0; i < todo.length && Date.now() - t0 < budgetMs; i += 12) {
    const batch = todo.slice(i, i + 12);
    let err: Error | null = null;
    const got = await Promise.all(batch.map((d) => readPaper(db, d).catch((e: Error) => { err = e; return null; })));
    if (err && got.every((e) => !e)) throw err; // nothing read in this batch: say why, keep what is saved
    entries.push(...got.filter((e): e is Entry => !!e));
    note(`Read ${Math.min(i + 12, todo.length)} of ${todo.length} papers`);
    r = { ...r, entries: order(), left: todo.length - Math.min(i + 12, todo.length) + got.filter((e) => !e).length };
    await saveReading(matter, r);
  }
  if (!r.left && (todo.length || redo || !prev)) {
    note("Checking which mentioned papers are not on file");
    r = { ...r, needed: await stillNeeded(order()).catch(() => r.needed) };
    await saveReading(matter, r);
  }
  return r;
}

const dots = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
/** The Markdown file in the skill's own layout, each field followed by its receipt. */
export function readingMarkdown(r: ReadingOrder, caseName: string, forum: string, label: (doc: string, page: number) => string): string {
  const f = (name: string, x: Field, doc: string) => `**${name}:** ${x ? `${x.text} ("${x.quote.replace(/\s+/g, " ").trim()}", ${label(doc, x.page)})` : "Not found in the papers on file."}`;
  const years = new Map<string, Entry[]>();
  for (const e of r.entries) years.set(e.iso?.slice(0, 4) ?? "Undated", [...(years.get(e.iso?.slice(0, 4) ?? "Undated") ?? []), e]);
  const out = [`# Chronological Reading Order — ${caseName}`, forum, ""];
  for (const [y, es] of years) {
    out.push(`## ${y}`, "");
    for (const e of es) out.push(`### ${e.iso ? `${dots(e.iso)} — ` : ""}${e.title}`, f("What it is", e.what, e.doc), f("What it says", e.says, e.doc),
      f("What it sets up", e.sets, e.doc), `**Importance:** ${e.importance}`, "", "---", "");
  }
  const ess = r.entries.filter((e) => e.importance === "Essential").map((e) => e.title);
  out.push("## Note", `${r.entries.length} papers${ess.length ? `; must-reads: ${ess.join("; ")}` : ""}. Every line is from the papers, with its page; "What it sets up" is only what the paper itself directs.`, "", "## Documents Still Needed", "");
  for (const t of TIERS) {
    const xs = r.needed.filter((n) => n.tier === t);
    out.push(`### ${t === "Lower priority" ? "Lower priority / for completeness" : t}`, ...(xs.length ? xs.map((n) => `- ${n.item}: mentioned in ${label(n.doc, n.page)}, "${n.quote.replace(/\s+/g, " ").trim()}"`) : ["- None found."]), "");
  }
  return out.join("\n");
}
