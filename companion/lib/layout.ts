// CC-80741E / CC-3EE64A (13-10-2026, Arya): on the "Index to the petition" Google Vision read the table cell by cell, so
// Sr. No., particulars, exhibit, date and pages came out as separate runs and her connected app paired the wrong ones.
// Vision also keeps where every word sits (words-NNN.json), so a table page is rebuilt row by row from those positions:
// words on one line stay on one line, each placed at its column, with 3+ spaces between cells so the reader draws it as
// a "spaced" block. Nothing is invented or reordered within a row; it is the page's own words where the page has them.

export type Word = [number, number, number, number, string]; // x0, y0, x1, y1 as 0-1 of the page, text

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

// A page scanned at a tilt (page 3 of that index sat about 2 degrees off) puts one row's words a few lines apart.
// Vision lists words in reading order, so neighbours a short gap apart give the page's slope; rows are found on level y.
export function slope(words: Word[]): number {
  const s: number[] = [];
  for (let i = 1; i < words.length; i++) {
    const a = words[i - 1], b = words[i], gap = b[0] - a[2];
    if (gap > 0 && gap < 0.08) s.push((b[1] + b[3] - a[1] - a[3]) / (b[0] + b[2] - a[0] - a[2]));
  }
  return s.length >= 5 ? median(s) : 0;
}

export function rows(words: Word[]): Word[][] {
  const h = median(words.map((w) => w[3] - w[1])) || 0.01, k = slope(words);
  const level = (w: Word) => (w[1] + w[3]) / 2 - k * (w[0] + w[2]) / 2;
  const lines: { y: number; ws: Word[] }[] = [];
  for (const w of [...words].sort((a, b) => level(a) - level(b))) {
    const y = level(w), line = lines.at(-1);
    if (line && Math.abs(y - line.y) < h * 0.6) { line.ws.push(w); line.y = (line.y * (line.ws.length - 1) + y) / line.ws.length; }
    else lines.push({ y, ws: [w] });
  }
  return lines.map((l) => l.ws.sort((a, b) => a[0] - b[0]));
}

// A cell break is a gap wider than about two letters' height; ordinary word spacing is under one.
const gapOf = (words: Word[]) => 2 * (median(words.map((w) => w[3] - w[1])) || 0.01);

// ponytail: a page is a table when at least a fifth of its lines have two or more cell breaks; a ruled-grid
// detector from the scan would catch one-column-gap tables too, add it if a table page is missed.
export function looksLikeTable(words: Word[]): boolean {
  const g = gapOf(words), ls = rows(words);
  const multi = ls.filter((l) => l.filter((w, i) => i && w[0] - l[i - 1][2] > g).length >= 2).length;
  return ls.length >= 6 && multi / ls.length >= 0.2;
}

export function tableText(words: Word[]): string {
  const g = gapOf(words);
  const cw = median(words.map((w) => (w[2] - w[0]) / Math.max(w[4].length, 1))) || 0.01; // one character's width
  return rows(words).map((l) => {
    let s = "";
    l.forEach((w, i) => {
      const brk = i > 0 && w[0] - l[i - 1][2] > g;
      // Vision splits "A" into touching pieces; only punctuation is joined back, so a margin "3" never fuses with "3."
      const glued = i > 0 && w[0] - l[i - 1][2] < cw * 0.25 && (/^[^\p{L}\p{N}]+$/u.test(w[4]) || /^[^\p{L}\p{N}]+$/u.test(l[i - 1][4]));
      const at = Math.max(s.length + (i === 0 ? 0 : glued ? 0 : brk ? 3 : 1), brk || i === 0 ? Math.round(w[0] / cw) : 0);
      s = s.padEnd(at) + w[4];
    });
    return s.trimEnd();
  }).join("\n").replace(/^\n+|\s+$/g, "");
}
