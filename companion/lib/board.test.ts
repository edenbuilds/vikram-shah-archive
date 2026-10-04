import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COLS, moveCard, reconcile } from "./board.ts";

test("a new matter lands in the first column and a missing one drops out", () => {
  const saved = { cols: DEFAULT_COLS.map((c, i) => ({ ...c, cards: i === 1 ? ["m:gone", "m:a", "t:x"] : [] })), tasks: { x: { title: "Call clerk", at: "" }, orphan: { title: "?", at: "" } } };
  const b = reconcile(saved, ["a", "b"]);
  assert.deepEqual(b.cols[0].cards, ["m:b"]);
  assert.deepEqual(b.cols[1].cards, ["m:a", "t:x"]);
  assert.deepEqual(Object.keys(b.tasks), ["x"]);
});

test("moving a card removes it from its old column and inserts it at the index", () => {
  const b = reconcile(null, ["a", "b", "c"]);
  const m = moveCard(b, "m:c", "ready", 0);
  assert.deepEqual(m.cols[0].cards, ["m:a", "m:b"]);
  assert.deepEqual(m.cols[2].cards, ["m:c"]);
  assert.deepEqual(moveCard(m, "m:a", "read", 9).cols[0].cards, ["m:b", "m:a"]);
});
