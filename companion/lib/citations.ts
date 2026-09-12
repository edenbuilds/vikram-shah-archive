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

export function verify(answer: ModelAnswer, chunks: Chunk[]): Verified {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const claims: VerifiedClaim[] = [];
  const rejected: Rejected[] = [];

  for (const claim of answer.claims ?? []) {
    const text = (claim.text ?? "").trim();
    if (!text) continue;
    const good: Citation[] = [];
    for (const c of claim.citations ?? []) {
      const ch = byId.get(c.chunk_id);
      if (ch && isSpan(c.quote, ch.text)) {
        good.push({ chunk_id: ch.id, doc_id: ch.doc_id, page_start: ch.page_start, page_end: ch.page_end, quote: c.quote.trim() });
      }
    }
    if (!good.length) {
      rejected.push({ text, reason: "no citation matched a verbatim span of the retrieved papers" });
      continue;
    }
    const missing = unsupportedFigures(text, good.map((g) => g.quote).join(" \n "));
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
