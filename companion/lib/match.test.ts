import { test } from "node:test";
import assert from "node:assert/strict";
import { matchChunks, mergeHits } from "./match.ts";

const row = (id: number, similarity: number, fts_rank = 0) => ({ id, similarity, fts_rank });

// A stand-in for the Supabase client: each matter id maps to the rows or the errors its calls return, in order.
function fakeDb(byMatter: Record<string, ({ rows: ReturnType<typeof row>[] } | { fail: string })[]>) {
  const calls: string[] = [];
  const db = {
    rpc: async (_name: string, args: { matter_ids: string[] }) => {
      const id = args.matter_ids[0];
      calls.push(id);
      const next = byMatter[id].shift()!;
      return "fail" in next ? { data: null, error: { code: "57014", message: next.fail } } : { data: next.rows, error: null };
    },
  };
  return { db: db as never, calls };
}

test("the best results overall come from the best of each matter, ranked like the database ranks them", () => {
  const merged = mergeHits([[row(1, 0.9), row(2, 0.5)], [row(3, 0.7, 0.9), row(4, 0.6)]], 3);
  assert.deepEqual(merged.map((r) => r.id), [3, 1, 4], "an exact-word match counts for at most 0.5 on top of its similarity");
});

test("a search over several matters returns the best rows of all of them, once each matter is searched on its own", async () => {
  const { db, calls } = fakeDb({ a: [{ rows: [row(1, 0.8), row(2, 0.4)] }], b: [{ rows: [row(3, 0.9)] }], c: [{ rows: [] }] });
  const out = await matchChunks(db, { embedding: [0.1], text: "order", matterIds: ["a", "b", "c", "a"], count: 2 });
  assert.deepEqual(out.map((r) => r.id), [3, 1]);
  assert.deepEqual(calls.sort(), ["a", "b", "c"], "a repeated matter id is searched once");
});

test("a matter that times out is tried again and the search still succeeds", async () => {
  const { db, calls } = fakeDb({ a: [{ fail: "canceling statement due to statement timeout" }, { rows: [row(1, 0.9)] }] });
  const out = await matchChunks(db, { embedding: null, text: "order", matterIds: ["a"], count: 5 });
  assert.deepEqual(out.map((r) => r.id), [1]);
  assert.equal(calls.length, 2);
});

test("a search that fails twice raises an error instead of returning no hits, so Ask never says the papers are silent", async () => {
  const quiet = console.error; console.error = () => {};
  try {
    const { db } = fakeDb({ a: [{ fail: "timeout" }, { fail: "timeout" }] });
    await assert.rejects(matchChunks(db, { embedding: [0.1], text: "order", matterIds: ["a"], count: 5 }), /too slow just now/);
  } finally { console.error = quiet; }
});

test("no matters means no hits and no database call", async () => {
  const { db, calls } = fakeDb({});
  assert.deepEqual(await matchChunks(db, { embedding: [0.1], text: "x", matterIds: [], count: 5 }), []);
  assert.equal(calls.length, 0);
});
