import { test } from "node:test";
import assert from "node:assert/strict";
import { findSpan } from "./excerpt.ts";

const t = "## Page 1 of 2\n\nSale deed dated\n01.02.2020.\n\n---\n\n## Page 2 of 2\n\nThe sale deed dated 03.04.2021\nwas registered.\n\n---\n";

test("words picked one per line are found in their own page's text, with its line breaks kept", () => {
  const s = findSpan(t, 2, "sale\ndeed\ndated\n03.04.2021\nwas")!;
  assert.equal(t.slice(s.start, s.end), "sale deed dated 03.04.2021\nwas");
});

test("the same words on another page are not taken from there", () => {
  assert.equal(findSpan(t, 1, "03.04.2021"), null);
});

test("words the page text does not hold give no excerpt", () => {
  assert.equal(findSpan(t, 2, "sale deed dated 05.06.2022"), null);
});
