import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";

// For LiquidText and any PDF reader: her notes and bookmarks as standard PDF comments. Hex strings so
// Marathi and Hindi survive (PDFDocEncoding is Latin only).
type N = { page_no: number | null; quote: string | null; body: string; tags: string[] };
// Each note becomes a standard PDF comment (sticky note) in the page's top-left margin, stacked down.
export async function withComments(pdf: Uint8Array, notes: N[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const pages = doc.getPages();
  const stack = new Map<number, number>();
  for (const n of notes) {
    const i = Math.min(Math.max((n.page_no ?? 1) - 1, 0), pages.length - 1);
    const pg = pages[i], k = stack.get(i) ?? 0;
    stack.set(i, k + 1);
    const top = pg.getHeight() - 24 - k * 22;
    const mark = n.tags.includes("bookmark");
    const text = mark ? `Bookmark: ${n.body}` : `${n.body}${n.quote ? `\n\non: "${n.quote}"` : ""}`;
    const annot = doc.context.register(doc.context.obj({
      Type: "Annot", Subtype: "Text", Rect: [6, top - 18, 24, top], Name: mark ? "Key" : "Comment",
      Contents: PDFHexString.fromText(text), T: PDFHexString.fromText("Case Companion"), Open: false, F: 4,
    }));
    const annots = pg.node.Annots();
    if (annots) annots.push(annot); else pg.node.set(PDFName.of("Annots"), doc.context.obj([annot]));
  }
  return doc.save();
}
