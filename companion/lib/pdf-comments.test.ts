import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString } from "pdf-lib";
import { withComments } from "./pdf-comments.ts";

test("her notes and bookmarks land on their pages as PDF comments, Marathi intact", async () => {
  const src = await PDFDocument.create();
  src.addPage(); src.addPage();
  const out = await PDFDocument.load(await withComments(await src.save(), [
    { page_no: 2, quote: "दिनांक 12-06-2026", body: "Check this date", tags: [] },
    { page_no: 1, quote: null, body: "Reply", tags: ["bookmark"] },
  ]));
  const texts = out.getPages().map((p) => (p.node.lookup(PDFName.of("Annots"), PDFArray)?.asArray() ?? [])
    .map((a) => (out.context.lookup(a, PDFDict).lookup(PDFName.of("Contents")) as PDFHexString).decodeText()));
  assert.deepEqual(texts, [["Bookmark: Reply"], ['Check this date\n\non: "दिनांक 12-06-2026"']]);
});
