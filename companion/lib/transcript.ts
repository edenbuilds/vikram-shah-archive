// Splits a verbatim transcript into display blocks without altering a character:
// every block carries its [start,end) offsets into documents.transcript, so an
// annotation can pin to an exact span and the source is never rewritten.

export type BlockKind = "heading" | "page" | "quote" | "table" | "rule" | "meta" | "para";
export type Block = { start: number; end: number; text: string; kind: BlockKind; page: number | null; pageEnd: number | null };

const PAGE = /^## Page (\d+)(?: of \d+)?\s*$/;
const SECTION = /^<!-- SECTION: .*?\| PDF pages (\d+)(?:-(\d+))? -->\s*$/;

function kindOf(text: string): BlockKind {
  if (PAGE.test(text)) return "page";
  if (text.startsWith("<!--")) return "meta";
  if (/^-{3,}$/.test(text)) return "rule";
  if (text.startsWith("#")) return "heading";
  if (text.startsWith(">")) return "quote";
  if (text.startsWith("|")) return "table";
  return "para";
}

export function toBlocks(t: string): Block[] {
  const out: Block[] = [];
  let page: number | null = null;
  let pageEnd: number | null = null;
  const re = /\n[ \t]*\n/g;
  let at = 0;
  const push = (s: number, e: number) => {
    const raw = t.slice(s, e);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) return;
    const start = s + lead;
    const m = text.match(PAGE);
    const sec = text.match(SECTION);
    if (m) page = pageEnd = Number(m[1]);
    else if (sec) {
      page = Number(sec[1]);
      pageEnd = Number(sec[2] ?? sec[1]);
    }
    out.push({ start, end: start + text.length, text, kind: kindOf(text), page, pageEnd });
  };
  for (let m = re.exec(t); m; m = re.exec(t)) {
    push(at, m.index);
    at = m.index + m[0].length;
  }
  push(at, t.length);
  return out;
}
