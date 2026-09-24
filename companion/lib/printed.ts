import type { SupabaseClient } from "@supabase/supabase-js";
import { readState, writeState } from "./access.ts";

// The page number printed on a page is often not its place in the PDF: a paper book numbers only
// its own pages (the Agile appeal's PDF p. 350 is printed "254"; blank backs carry no number), and
// a paper split out of a volume keeps the volume's numbering (Jay Hiren Gandhi's index: "Pg. 42-44").
// Found from the OCR text: a bare number on a page's first or last lines, kept only where it runs
// in sequence with its neighbours, so a stray figure or a year never passes as a page number.

const NUM = /^[-–(\[]?\s*(?:p(?:age|g)?\.?\s*)?(\d{1,4})\s*[-–)\]]?$/i;

function candidates(text: string | null): number[] {
  const l = (text ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const edge = l.length > 6 ? [...l.slice(0, 3), ...l.slice(-3)] : l;
  return [...new Set(edge.map((x) => +(x.match(NUM)?.[1] ?? 0)).filter((n) => n > 0))];
}

type Node = { p: number; c: number; len: number; prev: Node | null };

/** PDF page -> printed page number, for the pages where the paper prints one in sequence. */
export function printedNumbers(pages: { page_no: number; text: string | null }[]): Record<number, number> {
  const nodes = pages.flatMap((pg) => candidates(pg.text).map((c): Node => ({ p: pg.page_no, c, len: 1, prev: null })))
    .sort((a, b) => a.p - b.p);
  const out: Record<number, number> = {};
  // a blank back has no text and no number; never give it one (Shetty memo of appeal, PDF p. 10)
  const blank = new Set(pages.filter((pg) => !(pg.text ?? "").trim()).map((pg) => pg.page_no));
  // Longest run within [lo, hi], then the same again either side of it: a file can hold two numberings.
  const within = (lo: number, hi: number) => {
    const ns = nodes.filter((n) => n.p >= lo && n.p <= hi).map((n) => ({ ...n, len: 1, prev: null as Node | null }));
    let best: Node | null = null;
    for (let j = 0; j < ns.length; j++) {
      for (let i = j - 1; i >= 0 && ns[j].p - ns[i].p <= 20; i--) {
        const dp = ns[j].p - ns[i].p, dc = ns[j].c - ns[i].c;
        if (dp > 0 && dc >= 1 && dc <= dp && ns[i].len + 1 > ns[j].len) { ns[j].len = ns[i].len + 1; ns[j].prev = ns[i]; }
      }
      if (!best || ns[j].len > best.len) best = ns[j];
    }
    if (!best) return;
    const run: Node[] = [];
    for (let n: Node | null = best; n; n = n.prev) run.unshift(n);
    const tight = run.length === 2 && run[1].c - run[0].c === run[1].p - run[0].p;
    if (run.length < 3 && !tight) return;
    run.forEach((n, k) => {
      out[n.p] = n.c;
      const m = run[k + 1];
      if (m && m.c - n.c === m.p - n.p) for (let p = n.p + 1; p < m.p; p++) if (!blank.has(p)) out[p] = n.c + (p - n.p);
    });
    within(lo, run[0].p - 1);
    within(run.at(-1)!.p + 1, hi);
  };
  if (nodes.length) within(nodes[0].p, nodes.at(-1)!.p);
  return out;
}

/** "p. 254 (PDF 350)" where the printed number differs, else "p. 350". */
export const pageLabel = (pdf: number, printed?: number) => (printed && printed !== pdf ? `p. ${printed} (PDF ${pdf})` : `p. ${pdf}`);

export type Printed = Record<string, Record<number, number>>;
const at = (matter: string) => `_system/study/${matter}/printed.json`;

/** Printed numbers for every paper in a matter, worked out once per paper and kept in the bucket.
 *  Callers check matter access first. Papers never change after filing, so only new ones are read. */
export async function printedFor(db: SupabaseClient, matter: string): Promise<Printed> {
  const saved = await readState<Printed>(at(matter), {});
  const { data: docs } = await db.from("documents").select("id").eq("matter_id", matter);
  const missing = (docs ?? []).map((d) => d.id).filter((id) => !(id in saved));
  if (!missing.length) return saved;
  const one = async (id: string) => {
    const pages: { page_no: number; text: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("document_pages").select("page_no, text").eq("doc_id", id).order("page_no").range(from, from + 999);
      pages.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    saved[id] = printedNumbers(pages);
  };
  for (let i = 0; i < missing.length; i += 8) await Promise.all(missing.slice(i, i + 8).map(one));
  await writeState(at(matter), saved);
  return saved;
}
