import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreOne, trashOne, type Memory } from "./memory.ts";

const m = (id: string): Memory => ({ id, text: `item ${id}`, matter: null, source: "ai", at: "2026-10-06T00:00:00.000Z" });

test("forgetting moves a memory to the trash instead of deleting it, and restoring puts it back", () => {
  const s = { items: [m("a"), m("b")], trash: [] };
  const gone = trashOne(s, "a", new Date("2026-10-06T10:00:00.000Z"));
  assert.deepEqual(gone.items.map((x) => x.id), ["b"]);
  assert.equal(gone.trash[0].id, "a");
  assert.equal(gone.trash[0].gone, "2026-10-06T10:00:00.000Z");
  const back = restoreOne(gone, "a");
  assert.deepEqual(back.items.map((x) => x.id), ["b", "a"]);
  assert.equal(back.trash.length, 0);
  assert.equal("gone" in back.items[1], false);
});

test("forgetting or restoring an id that is not there changes nothing", () => {
  const s = { items: [m("a")], trash: [] };
  assert.equal(trashOne(s, "zz"), s);
  assert.equal(restoreOne(s, "zz"), s);
});
