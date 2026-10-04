import { test } from "node:test";
import assert from "node:assert/strict";
import { pairOcr } from "./ocr-pair.ts";

const f = (name: string) => ({ name });

test("a scan and its same-named OCR text become one paper", () => {
  const r = pairOcr([f("Appeal.pdf"), f("Appeal.txt"), f("Order.pdf"), f("Order.ocr.txt")]);
  assert.deepEqual(r.map((x) => [x.file.name, x.ocr?.name]), [["Appeal.pdf", "Appeal.txt"], ["Order.pdf", "Order.ocr.txt"]]);
});

test("a text file with no matching scan is still its own paper", () => {
  const r = pairOcr([f("Notes.md"), f("Appeal.pdf")]);
  assert.deepEqual(r.map((x) => [x.file.name, x.ocr?.name]), [["Appeal.pdf", undefined], ["Notes.md", undefined]]);
});
