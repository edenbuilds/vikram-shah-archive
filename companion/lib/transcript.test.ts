import { test } from "node:test";
import assert from "node:assert/strict";
import { toBlocks } from "./transcript.ts";

test("blocks are exact slices with page numbers from page markers", () => {
  const t = "# Title\n\n## Page 1 of 2\n\nFirst para.\nstill first.\n\n---\n\n## Page 2 of 2\n\n  Second para.  \n";
  const b = toBlocks(t);
  for (const x of b) assert.equal(t.slice(x.start, x.end), x.text);
  const paras = b.filter((x) => x.kind === "para");
  assert.deepEqual(paras.map((p) => [p.text, p.page]), [["First para.\nstill first.", 1], ["Second para.", 2]]);
  assert.equal(b[0].page, null);
});

test("section markers give page ranges for continuous OCR", () => {
  const b = toBlocks("<!-- SECTION: x | PDF pages 3-9 -->\n\nBody text.");
  assert.deepEqual([b[1].page, b[1].pageEnd, b[0].kind], [3, 9, "meta"]);
});
