// A scan uploaded with her own OCR text ("Appeal.pdf" + "Appeal.txt" or "Appeal.ocr.txt") is one
// paper: the text is used for its pages instead of reading the scan again (worker given_ocr).
// A text file with no matching scan is a paper of its own, as before.
const TEXT = /\.(txt|md|markdown)$/i;
const base = (n: string) => n.replace(/(\.ocr)?\.[a-z0-9]+$/i, "").toLowerCase();

export function pairOcr<T extends { name: string }>(files: T[]): { file: T; ocr?: T }[] {
  const scans = files.filter((f) => !TEXT.test(f.name));
  const out: { file: T; ocr?: T }[] = scans.map((file) => ({ file }));
  for (const t of files.filter((f) => TEXT.test(f.name))) {
    const row = out.find((r) => !r.ocr && !TEXT.test(r.file.name) && base(r.file.name) === base(t.name));
    if (row) row.ocr = t;
    else out.push({ file: t });
  }
  return out;
}
