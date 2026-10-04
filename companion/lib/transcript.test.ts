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

test("rows spaced into columns are kept spaced, ordinary prose with a stray double gap is not", () => {
  const rows = "Date   Event   Page\n01-02-2020   Notice issued   4\n05-06-2020   Reply filed   9";
  assert.equal(toBlocks(rows)[0].kind, "spaced");
  assert.equal(toBlocks("A sentence  with a stray gap\nand a second line.")[0].kind, "para");
  assert.equal(toBlocks("2007-2009      Tenant-entry clearance, funded via Pravar\nStatement of funding and expenses")[0].kind, "spaced");
  assert.equal(toBlocks("Ordinary prose with single spaces.\nAnd a second line.")[0].kind, "para");
});
