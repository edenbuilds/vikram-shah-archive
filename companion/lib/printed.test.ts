import { test } from "node:test";
import assert from "node:assert/strict";
import { pageLabel, printedNumbers } from "./printed.ts";

const page = (page_no: number, ...lines: string[]) => ({ page_no, text: ["heading of the page", ...lines, "body text", "more body", "last words"].join("\n") });

test("a paper book numbered from its own first page reads as printed numbers, offset from the PDF", () => {
  const got = printedNumbers([page(1, "INDEX"), page(2), ...[3, 4, 5, 6, 7].map((p) => page(p, String(p + 250)))]);
  assert.deepEqual(got, { 3: 253, 4: 254, 5: 255, 6: 256, 7: 257 });
});

test("blank backs are skipped, a missed number between two in step is filled, stray figures and years are ignored", () => {
  const got = printedNumbers([page(7, "1"), page(8), page(9, "2"), page(10, "2026"), page(11, "3"), page(12, "4"), page(13, "77"), page(14, "6")]);
  assert.equal(got[7], 1); assert.equal(got[9], 2); assert.equal(got[11], 3); assert.equal(got[12], 4);
  assert.equal(got[13], 5); assert.equal(got[14], 6);
  assert.equal(got[8], undefined); assert.equal(got[10], undefined);
});

test("one lone number is not a numbering", () => {
  assert.deepEqual(printedNumbers([page(1, "42"), page(2), page(3)]), {});
  assert.equal(pageLabel(350, 254), "p. 254 (PDF 350)");
  assert.equal(pageLabel(4, 4), "p. 4");
});
