// Dates, amounts and case references exactly as printed on a paper, with the pages they sit on.
// Pattern matching only: nothing is inferred, normalised or totalled.
export type Fact = { kind: "date" | "amount" | "ref"; text: string; pages: number[] };

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*";
const PATTERNS: [Fact["kind"], RegExp][] = [
  ["date", new RegExp(`\\b\\d{1,2}[./-]\\d{1,2}[./-](?:19|20)\\d{2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH},?\\s+(?:19|20)\\d{2}\\b|\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,\\s+(?:19|20)\\d{2}\\b`, "gi")],
  ["amount", /(?:Rs\.?|INR|₹)\s?\d[\d,]*(?:\.\d+)?(?:\s?\/-)?/gi],
  ["ref", /\b(?:Complaint|Appeal|Writ Petition|W\.P\.|Review Application|Interim Application|Suit|AAR|SCS|C\.P\.\s?\(CAA\))\s*(?:Nos?\.?|Number)\s*:?\s*[A-Z0-9][A-Z0-9/().,& -]{1,40}\d/g],
];

export function facts(pages: { page_no: number; text: string | null }[], limit = 60): Fact[] {
  const seen = new Map<string, Fact>();
  for (const p of pages) {
    for (const [kind, re] of PATTERNS) {
      for (const m of (p.text ?? "").matchAll(re)) {
        const text = m[0].replace(/\s+/g, " ").trim().replace(/[ ,&(-]+$/, "");
        const key = `${kind}:${text.toLowerCase()}`;
        const f = seen.get(key) ?? { kind, text, pages: [] };
        if (!f.pages.includes(p.page_no)) f.pages.push(p.page_no);
        seen.set(key, f);
      }
    }
  }
  return [...seen.values()].slice(0, limit);
}
