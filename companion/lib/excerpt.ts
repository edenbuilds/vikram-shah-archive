// 13-10-2026: an excerpt is words picked on the scan (OCR word boxes), but its quote must be the stored page text,
// never the boxes' own reading. Find the picked words in that page's block of the transcript, ignoring
// whitespace (the boxes come one word per line); null when the page text doesn't contain them.
export function findSpan(transcript: string, page: number, picked: string): { start: number; end: number } | null {
  const mark = new RegExp(`^##\\s+Page\\s+${page}(?:\\s+of\\s+\\d+)?\\s*$`, "im").exec(transcript);
  if (!mark) return null;
  const from = mark.index + mark[0].length;
  const next = /^##\s+Page\s+\d+/im.exec(transcript.slice(from));
  const to = next ? from + next.index : transcript.length;
  const at: number[] = [];
  let flat = "";
  for (let i = from; i < to; i++) if (!/\s/.test(transcript[i])) { flat += transcript[i]; at.push(i); }
  const needle = picked.replace(/\s+/g, "");
  const k = needle ? flat.indexOf(needle) : -1;
  return k < 0 ? null : { start: at[k], end: at[k + needle.length - 1] + 1 };
}
