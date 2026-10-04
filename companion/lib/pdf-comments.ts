import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";

// For LiquidText and any PDF reader: her notes and bookmarks as standard PDF comments. Hex strings so
// Marathi and Hindi survive (PDFDocEncoding is Latin only).
type N = { page_no: number | null; quote: string | null; body: string; tags: string[] };
// A highlight's shape: rects are [x, y, w, h] fractions of the page from its top left (worker/pdf_notes.py).
export type Ink = { page: number; color: string | null; rects: number[][]; body: string; quote: string | null; tags?: string[] };
const rgb = (hex: string | null) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) : [1, 0.92, 0.23]);
// Each note becomes a standard PDF comment (sticky note) in the page's top-left margin, stacked down.
// Highlights with a shape become real PDF highlights in her colour, so LiquidText, PDFgear and Acrobat
// show them as their own; the rest stay comments.
export async function withComments(pdf: Uint8Array, notes: N[], ink: Ink[] = []): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const pages = doc.getPages();
  const stack = new Map<number, number>();
  const add = (i: number, obj: Record<string, unknown>) => {
    const annot = doc.context.register(doc.context.obj(obj as never));
    const annots = pages[i].node.Annots();
    if (annots) annots.push(annot); else pages[i].node.set(PDFName.of("Annots"), doc.context.obj([annot]));
  };
  const shaped = new Set<string>();
  for (const h of ink) {
    const i = h.page - 1;
    if (i < 0 || i >= pages.length || !h.rects.length) continue;
    const W = pages[i].getWidth(), H = pages[i].getHeight();
    const quads = h.rects.flatMap(([x, y, w, hh]) => [x * W, H - y * H, (x + w) * W, H - y * H, x * W, H - (y + hh) * H, (x + w) * W, H - (y + hh) * H]);
    const xs = quads.filter((_, k) => k % 2 === 0), ys = quads.filter((_, k) => k % 2 === 1);
    add(i, { Type: "Annot", Subtype: "Highlight", Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], QuadPoints: quads,
      C: rgb(h.color), Contents: PDFHexString.fromText(h.quote ? `${h.body}\n\n"${h.quote}"` : h.body), T: PDFHexString.fromText("Case Companion"), F: 4 });
    shaped.add(`${h.page}|${h.body}|${h.quote ?? ""}`);
  }
  for (const n of notes) {
    if (shaped.has(`${n.page_no}|${n.body}|${n.quote ?? ""}`)) continue;  // already drawn as a highlight
    const i = Math.min(Math.max((n.page_no ?? 1) - 1, 0), pages.length - 1);
    const pg = pages[i], k = stack.get(i) ?? 0;
    stack.set(i, k + 1);
    const top = pg.getHeight() - 24 - k * 22;
    const mark = n.tags.includes("bookmark");
    const text = mark ? `Bookmark: ${n.body}` : `${n.body}${n.quote ? `\n\non: "${n.quote}"` : ""}`;
    add(i, { Type: "Annot", Subtype: "Text", Rect: [6, top - 18, 24, top], Name: mark ? "Key" : "Comment",
      Contents: PDFHexString.fromText(text), T: PDFHexString.fromText("Case Companion"), Open: false, F: 4 });
  }
  return doc.save();
}
