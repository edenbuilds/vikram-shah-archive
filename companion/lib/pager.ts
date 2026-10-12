// 12-10-2026 CC-689411: Arya: "there is no way to go to page 80 ... without manually clicking on this arrow". The reader's page box
// sends what she typed here; a typed 80 of 88 opens page 80, 500 opens the last page, and anything that is not a whole number does nothing.
export function goToPage(raw: unknown, count: number): number | null {
  const s = String(raw ?? "").trim();
  if (!/^\d+$/.test(s) || count < 1) return null;
  return Math.min(Math.max(Number(s), 1), count);
}
