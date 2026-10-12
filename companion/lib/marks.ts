// 12-10-2026 CC-62B3E4: Arya: "Identify stamps/ signs/ marks or anything of relevance while OCRing. Note down the details regarding
// them." OCR reads words only, so a notary seal's text landed in the middle of a table with nothing saying it was a seal. A page's
// marks are read from its scan by a model and kept here, in their own file per paper. They are never merged into the filed text or
// into her notes: the model can be wrong, and the paper stays as filed.
export const MARK_KINDS = ["stamp", "seal", "signature", "initials", "handwriting", "strike-through", "other"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export type Mark = { kind: MarkKind; what: string; text: string | null; where: string };
export type PageMarks = { at: string; by: string; model: string; marks: Mark[] };

const NONE = /^(none|no\b|nothing|n\/a|not applicable|nil)/i;
const flat = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// What the model sent, made safe to store and show: known kinds only, short plain strings, no "none found" rows, no repeats, at most 12.
export function cleanMarks(raw: unknown): Mark[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { marks?: unknown }).marks) ? (raw as { marks: unknown[] }).marks : [];
  const seen = new Set<string>();
  const out: Mark[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const what = flat(o.what, 240);
    if (!what || NONE.test(what)) continue;
    const kind = (MARK_KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as MarkKind) : "other";
    const where = flat(o.where, 60);
    const key = `${kind}|${what.toLowerCase()}|${where.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, what, text: flat(o.text, 300) || null, where });
    if (out.length === 12) break;
  }
  return out;
}

export const MARK_LABEL: Record<MarkKind, string> = { stamp: "Stamp", seal: "Seal", signature: "Signature", initials: "Initials", handwriting: "Handwriting", "strike-through": "Struck through", other: "Mark" };
