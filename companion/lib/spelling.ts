// 04-10-2026: Omkar: "typo here (major)". The Statement of Claim itself prints "Mr. Vikarm Shah" (checked on the scan),
// so the explainer quotes it truthfully while the matter says Vikram. The record is never corrected; the page says so.
const words = (s: string) => s.match(/\p{L}{5,}/gu) ?? [];

/** One edit apart, a swap of two neighbouring letters counting as one (Vikarm / Vikram). */
export function oneOff(a: string, b: string): boolean {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  const [x, y] = [a.slice(i), b.slice(i)];
  if (x.length === y.length) return x.slice(1) === y.slice(1) || (x[0] === y[1] && x[1] === y[0] && x.slice(2) === y.slice(2));
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return s === l.slice(1);
}

/** Capitalised words in `text` that are a near-miss of a word in the matter's own name: [as the paper has it, as the matter lists it]. */
export function spelledDifferently(text: string, matterName: string): [string, string][] {
  const listed = words(matterName), out = new Map<string, string>();
  for (const w of text.match(/\p{Lu}\p{L}{4,}/gu) ?? []) {
    if (listed.some((l) => l.toLowerCase() === w.toLowerCase())) continue;
    const l = listed.find((x) => oneOff(w, x));
    if (l) out.set(w, l);
  }
  return [...out];
}
