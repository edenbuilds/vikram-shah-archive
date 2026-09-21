// Citation-or-refuse, enforced in code rather than trusted to the prompt.
// A claim survives only if every citation's quote is a verbatim span of the chunk it
// names, and every figure in the claim (dates, amounts, numbers) appears in those quotes.

export type Chunk = { id: number; doc_id: string; page_start: number; page_end: number; text: string };
export type ModelCitation = { chunk_id: number; quote: string };
export type ModelClaim = { text: string; citations: ModelCitation[] };
export type ModelAnswer = { status: "answered" | "not_in_corpus"; claims: ModelClaim[] };

export type Citation = { chunk_id: number; doc_id: string; page_start: number; page_end: number; quote: string };
export type VerifiedClaim = { text: string; citations: Citation[] };
export type Rejected = { text: string; reason: string };
export type Verified = { status: "answered" | "not_in_corpus"; claims: VerifiedClaim[]; rejected: Rejected[] };

const MIN_QUOTE = 8;

export function norm(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\*\*|__/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const figures = (s: string) => s.match(/\d+(?:[.,/]\d+)*/g) ?? [];

// Is `quote` a verbatim (whitespace/punctuation-normalised) span of `source`?
export function isSpan(quote: string, source: string, min = MIN_QUOTE): boolean {
  const q = norm(quote);
  return q.length >= min && norm(source).includes(q);
}

// Every figure in `text` must appear in `support`. A figure that appears nowhere in the
// quoted source is treated as invented.
export function unsupportedFigures(text: string, support: string): string[] {
  const s = norm(support);
  return figures(text).filter((n) => !s.includes(n.toLowerCase()));
}

// `titles` (doc id -> title as filed) lets a claim name its cited paper by title, e.g.
// "the Order dt 07.08.24". Figures from the title of a paper the claim actually cites
// count as sourced. Figures echoed from the question do not.
export function verify(answer: ModelAnswer, chunks: Chunk[], titles: Record<string, string> = {}): Verified {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const claims: VerifiedClaim[] = [];
  const rejected: Rejected[] = [];

  for (const claim of answer.claims ?? []) {
    const text = (claim.text ?? "").trim();
    if (!text) continue;
    const good: Citation[] = [];
    for (const c of claim.citations ?? []) {
      // A verbatim quote tagged with the wrong excerpt id is re-pinned to the excerpt that
      // actually holds it (seen live 2026-09-21: text from chunk 4064 cited as 4065). The
      // quote is still checked character-for-character; only the page shown is corrected.
      const named = byId.get(c.chunk_id);
      const ch = named && isSpan(c.quote, named.text) ? named : chunks.find((x) => isSpan(c.quote, x.text));
      if (ch) {
        good.push({ chunk_id: ch.id, doc_id: ch.doc_id, page_start: ch.page_start, page_end: ch.page_end, quote: c.quote.trim() });
      }
    }
    if (!good.length) {
      const tried = (claim.citations ?? []).map((c) => `chunk ${c.chunk_id}: "${(c.quote ?? "").slice(0, 160)}"`).join("; ");
      rejected.push({ text, reason: `no citation matched a verbatim span of the retrieved papers (offered ${tried || "none"})` });
      continue;
    }
    const support = [...good.map((g) => g.quote), ...new Set(good.map((g) => titles[g.doc_id] ?? ""))].join(" \n ");
    const missing = unsupportedFigures(text, support);
    if (missing.length) {
      rejected.push({ text, reason: `figure(s) not in the quoted source: ${missing.join(", ")}` });
      continue;
    }
    claims.push({ text, citations: good });
  }

  return {
    status: answer.status === "answered" && claims.length ? "answered" : "not_in_corpus",
    claims,
    rejected,
  };
}
