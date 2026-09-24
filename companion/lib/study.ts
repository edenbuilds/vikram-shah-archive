import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readState, writeState } from "./access.ts";
import type { VerifiedClaim, Rejected } from "./citations.ts";
import { pageLabel } from "./printed.ts";

// Study aids built from the papers: hearing brief, comparisons, the dates in the record, pins.
// Each saved aid remembers the papers it was made from (its "basis"), so when new papers arrive
// the app can ask before remaking it instead of silently changing her work.
// Stored as small JSON files in the private bucket; every caller checks matter access first
// (getMatter with her own client), because these reads use the service role.

export type Basis = { papers: number; last: string };
export async function basisOf(db: SupabaseClient, matter: string): Promise<Basis> {
  const { data } = await db.from("documents").select("ingested_at").eq("matter_id", matter);
  return { papers: (data ?? []).length, last: (data ?? []).reduce((a, d) => (d.ingested_at > a ? d.ingested_at : a), "") };
}
/** New papers since `saved` was made, or 0 when it is current (or was acknowledged). */
export const newSince = (saved: Basis | undefined, now: Basis, ack?: Basis) =>
  !saved || (saved.papers === now.papers && saved.last === now.last) || (ack && ack.papers === now.papers && ack.last === now.last)
    ? 0 : Math.max(1, now.papers - saved.papers);

export type Section = { key: string; title: string; status: "answered" | "not_in_corpus"; claims: VerifiedClaim[]; rejected: Rejected[] };
export type Brief = { made_at: string; basis: Basis; ack?: Basis; hearing: { date: string; purpose: string | null; forum: string | null } | null; sections: Section[] };
export type Explainer = { made_at: string; basis: Basis; ack?: Basis; sections: Section[] };
export type Comparison = { id: string; point: string; made_at: string; basis: Basis; status: "answered" | "not_in_corpus"; claims: VerifiedClaim[]; rejected: Rejected[] };
export type DateMention = { doc: string; page: number; printed: string; quote: string };
export type PaperDates = { made_at: string; basis: Basis; ack?: Basis; dates: { iso: string; mentions: DateMention[]; more: number }[] };

const at = (matter: string, what: string) => `_system/study/${matter}/${what}.json`;
export const getBrief = (m: string) => readState<Brief | null>(at(m, "brief"), null);
export const saveBrief = (m: string, b: Brief) => writeState(at(m, "brief"), b);
export const getExplainer = (m: string) => readState<Explainer | null>(at(m, "explainer"), null);
export const saveExplainer = (m: string, e: Explainer) => writeState(at(m, "explainer"), e);
/** Her own explainer file for a matter, if she gave one (kept beside the made one, never mixed in). */
export const yoursPath = (m: string) => `_system/study/${m}/explainer-yours.pdf`;
export const getComparisons = (m: string) => readState<Comparison[]>(at(m, "compare"), []);
export const saveComparisons = (m: string, c: Comparison[]) => writeState(at(m, "compare"), c.slice(0, 30));
export const getDates = (m: string) => readState<PaperDates | null>(at(m, "dates"), null);
export const saveDates = (m: string, d: PaperDates) => writeState(at(m, "dates"), d);

// ── dates in the record ─────────────────────────────────────────────────────
const MON = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE = new RegExp(
  String.raw`(?<![\d.])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d])` +
  String.raw`|\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+day\s+of)?\s+(${MON})\.?,?\s+(\d{4})\b` +
  String.raw`|\b(${MON})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`, "gi");
const month = (s: string) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3).toLowerCase()) + 1;

/** Every date printed on a page, as ISO dates, with the words around it (verbatim, whitespace collapsed). */
export function datesIn(text: string): { iso: string; printed: string; quote: string }[] {
  const flat = text.replace(/\s+/g, " ");
  const out: { iso: string; printed: string; quote: string }[] = [];
  for (const m of flat.matchAll(DATE)) {
    let d: number, mo: number, y: number;
    if (m[1]) {
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (m[3].length === 2) { if (m[1].length !== 2 || m[2].length !== 2) continue; y += y <= 40 ? 2000 : 1900; } // "10.07.24", not "2.3.10"
    } else if (m[4]) { d = +m[4]; mo = month(m[5]); y = +m[6]; }
    else { d = +m[8]; mo = month(m[7]); y = +m[9]; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1950 || y > 2040) continue;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCDate() !== d) continue; // 31.02.2020
    const a = Math.max(0, flat.lastIndexOf(" ", Math.max(0, m.index! - 110)));
    const b = flat.indexOf(" ", Math.min(flat.length, m.index! + m[0].length + 110));
    out.push({ iso: dt.toISOString().slice(0, 10), printed: m[0], quote: flat.slice(a, b < 0 ? flat.length : b).trim() });
  }
  return out;
}

/** All dates in a matter's papers, oldest first; each date keeps up to 8 pages that print it. */
export async function buildDates(db: SupabaseClient, matter: string): Promise<PaperDates> {
  const { data: docs } = await db.from("documents").select("id").eq("matter_id", matter);
  const ids = (docs ?? []).map((d) => d.id);
  const by = new Map<string, { mentions: DateMention[]; more: number; seen: Set<string> }>();
  for (let i = 0; i < ids.length; i += 40) {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("document_pages").select("doc_id, page_no, text").in("doc_id", ids.slice(i, i + 40)).order("doc_id").order("page_no").range(from, from + 999);
      for (const p of data ?? []) {
        for (const x of datesIn(p.text ?? "")) {
          const e = by.get(x.iso) ?? { mentions: [], more: 0, seen: new Set() };
          by.set(x.iso, e);
          const k = `${p.doc_id}#${p.page_no}`;
          if (e.seen.has(k)) continue;
          e.seen.add(k);
          if (e.mentions.length < 8) e.mentions.push({ doc: p.doc_id, page: p.page_no, printed: x.printed, quote: x.quote });
          else e.more++;
        }
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  return {
    made_at: new Date().toISOString(), basis: await basisOf(db, matter),
    dates: [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([iso, e]) => ({ iso, mentions: e.mentions, more: e.more })),
  };
}

// ── pins ────────────────────────────────────────────────────────────────────
export type Pin = { id: string; matter: string; doc: string; title: string; page: number; quote: string; at: string };
const pinPath = (email: string) => `_system/pins/${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}.json`;
export const pinId = (doc: string, page: number, quote: string) => createHash("sha256").update(`${doc}#${page}#${quote.replace(/\s+/g, " ").trim()}`).digest("hex").slice(0, 16);
export const getPins = (email: string) => readState<Pin[]>(pinPath(email), []);
export const savePins = (email: string, p: Pin[]) => writeState(pinPath(email), p);

/** "quote" (Paper, p. 3): one line per pin, ready to paste into a draft; the printed page first where it differs. */
export const reference = (p: Pin, printed?: number) => `"${p.quote.replace(/\s+/g, " ").trim()}" (${p.title}, ${pageLabel(p.page, printed)})`;
