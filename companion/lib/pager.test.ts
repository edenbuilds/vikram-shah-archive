import assert from "node:assert/strict";
import { test } from "node:test";
import { goToPage } from "./pager.ts";

test("typing a page number in the box opens that page", () => {
  assert.equal(goToPage("80", 88), 80);
  assert.equal(goToPage(" 7 ", 88), 7);
});
test("a page past the end opens the last page and 0 opens the first", () => {
  assert.equal(goToPage("500", 88), 88);
  assert.equal(goToPage("0", 88), 1);
});
test("anything that is not a whole number does nothing, so a stray Enter never moves her", () => {
  for (const bad of ["", "  ", "abc", "4.5", "-3", "1e2", null, undefined]) assert.equal(goToPage(bad, 88), null);
  assert.equal(goToPage("3", 0), null);
});
