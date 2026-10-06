import type { SupabaseClient } from "@supabase/supabase-js";
import { readState, writeState } from "./access.ts";

// Corrections to a paper's read text, page by page, by anyone who can see the matter (web, MCP, or
// an edited Markdown download uploaded back). The scan and the PDF are never touched. The text the
// worker first read is kept here with every later version, so any page can be put back.
// 04-10-2026: she asked to fix pages the OCR got wrong, and for her connected app to do so when it notices.

export type Version = { text: string; by: string; at: string; reason: string | null; via: "web" | "markdown" | "ai" | "revert" };
export type PageHistory = { original: string; original_source: string | null; versions: Version[] };
const file = (doc: string) => `_system/corrections/${doc}.json`;

export const getHistory = (doc: string) => readState<Record<string, PageHistory>>(file(doc), {});

// Same cut as worker/corpus.py chunk_text (paragraphs merged to ~900 chars, long ones split on lines at 1600).
export function chunkText(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const p of text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    let pieces = [p];
    if (p.length > 1600) {
      pieces = []; let cur = "";
      for (const ln of p.split("\n")) { if (cur && cur.length + ln.length > 1600) { pieces.push(cur); cur = ""; } cur = cur ? `${cur}\n${ln}` : ln; }
      if (cur) pieces.push(cur);
    }
    for (const piece of pieces) { if (buf && buf.length + piece.length > 900) { out.push(buf); buf = ""; } buf = buf ? `${buf}\n\n${piece}` : piece; }
  }
  if (buf) out.push(buf);
  return out.filter((x) => x.trim().length >= 20);
}

// "## Page 3" or "## Page 3 of 12" (the Markdown download, and the worker's transcript) -> {3: text}.
export function splitMarkdown(md: string): Map<number, string> {
  const pages = new Map<number, string>();
  const marks = [...md.matchAll(/^##\s+Page\s+(\d+)(?:\s+of\s+\d+)?\s*$/gim)];
  marks.forEach((m, i) => {
    const body = md.slice(m.index! + m[0].length, marks[i + 1]?.index ?? md.length).replace(/\n-{3,}\s*$/, "").trim();
    pages.set(Number(m[1]), body);
  });
  return pages;
}

// Swap one page's block in the page-keyed transcript; null when the transcript has no such marker.
export function replacePage(transcript: string, page: number, text: string): string | null {
  const re = new RegExp(`(## Page ${page} of \\d+\\n\\n)[\\s\\S]*?(\\n\\n---\\n)`);
  return re.test(transcript) ? transcript.replace(re, (_, a, b) => `${a}${text.trim() || "[ILLEGIBLE: no text on this page]"}${b}`) : null;
}

const UNREAD = /^\[ILLEGIBLE[^\]]*\]$/;

// db is the service client; the caller has already checked she can see the paper.
export async function correctPage(db: SupabaseClient, doc: { id: string; matter_id: string }, page: number, text: string,
  who: { by: string; reason: string | null; via: Version["via"] }): Promise<"saved" | "unchanged" | "no such page"> {
  const clean = text.replace(/\r\n/g, "\n").trim();
  const { data: cur } = await db.from("document_pages").select("text, text_source").eq("doc_id", doc.id).eq("page_no", page).maybeSingle();
  if (!cur) return "no such page";
  if ((cur.text ?? "").trim() === clean || (!cur.text && UNREAD.test(clean))) return "unchanged";

  // ponytail: one JSON per paper, read-modify-write; two people saving the same paper at the same
  // second can drop one history entry (the page text itself is still the last save). A table if needed.
  const hist = await getHistory(doc.id);
  hist[page] ??= { original: cur.text ?? "", original_source: cur.text_source ?? null, versions: [] };
  hist[page].versions.push({ text: clean, by: who.by, at: new Date().toISOString(), reason: who.reason, via: who.via });
  await writeState(file(doc.id), hist);

  const back = who.via === "revert" && clean === hist[page].original.trim();
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  must(await db.from("document_pages").update({ text: clean || null, text_source: back ? hist[page].original_source : "corrected" }).eq("doc_id", doc.id).eq("page_no", page));
  // Search passages for this page: rebuilt from the new text; embeddings are filled by the worker's backfill.
  must(await db.from("chunks").delete().eq("doc_id", doc.id).eq("page_start", page).eq("page_end", page));
  const rows = chunkText(clean).map((t, k) => ({ doc_id: doc.id, matter_id: doc.matter_id, page_start: page, page_end: page, ord: 1_000_000 + page * 100 + k, text: t }));
  if (rows.length) must(await db.from("chunks").insert(rows));
  const { data: d } = await db.from("documents").select("transcript").eq("id", doc.id).single();
  const t = d?.transcript ? replacePage(d.transcript, page, clean) : null;
  // ponytail: papers loaded before page-keyed transcripts keep their old reading text; pages, search and quotes still update.
  if (t) must(await db.from("documents").update({ transcript: t }).eq("id", doc.id));
  return "saved";
}
