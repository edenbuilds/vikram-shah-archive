import { test } from "node:test";
import assert from "node:assert/strict";
import { arrange, type Entry } from "./reading.ts";

const e = (doc: string, iso: string | null, importance: Entry["importance"]): Entry =>
  ({ doc, title: doc, iso, printed: null, what: null, says: null, sets: null, importance, mentions: [] });
const all = [e("loi", "2010-05-25", "High"), e("petition", "2024-11-21", "Essential"), e("receipt", null, "Skim"), e("order", "2021-10-08", "Essential")];

test("the date tab lists newest first when asked, with undated papers last", () => {
  assert.deepEqual(arrange(all, "date", true).map(([y, xs]) => [y, xs.map((x) => x.doc)]), [["2024", ["petition"]], ["2021", ["order"]], ["2010", ["loi"]], ["Undated", ["receipt"]]]);
  assert.deepEqual(arrange(all, "date", false).flatMap(([, xs]) => xs.map((x) => x.doc)), ["loi", "order", "petition", "receipt"]);
});

test("the importance tab puts the papers that carry the case first", () => {
  assert.deepEqual(arrange(all, "importance", false).map(([l, xs]) => [l, xs.map((x) => x.doc)]), [["Essential", ["order", "petition"]], ["High", ["loi"]], ["Skim", ["receipt"]]]);
});
