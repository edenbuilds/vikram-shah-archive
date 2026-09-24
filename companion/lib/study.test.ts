import { test } from "node:test";
import assert from "node:assert/strict";
import { datesIn, newSince } from "./study.ts";

test("dates are read in Indian day-month order and in words, with the words around them", () => {
  const d = datesIn("Agreement dated 19.08.2015 and notice of 23rd September, 2026; order of July 9, 2026 and 10.07.24.");
  assert.deepEqual(d.map((x) => x.iso), ["2015-08-19", "2026-09-23", "2026-07-09", "2024-07-10"]);
  assert.ok(d[0].quote.includes("Agreement dated 19.08.2015"));
});

test("paragraph numbers and impossible dates are not dates", () => {
  assert.deepEqual(datesIn("para 2.3.10 and 31.02.2020 and 45.13.2019 and Rs. 12.50.000").map((x) => x.iso), []);
});

test("an aid is stale only when papers changed since it was made and she has not said keep it", () => {
  const a = { papers: 3, last: "x" }, b = { papers: 5, last: "y" };
  assert.equal(newSince(a, a), 0);
  assert.equal(newSince(a, b), 2);
  assert.equal(newSince(a, b, b), 0);
});
