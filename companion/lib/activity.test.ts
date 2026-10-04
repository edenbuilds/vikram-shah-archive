import { test } from "node:test";
import assert from "node:assert/strict";
import { merge } from "./activity.ts";

test("the timeline keeps one row per event, newest first, and a fresh copy replaces the stored one", () => {
  const stored = [{ key: "job:1:processing", at: "2026-10-04T08:00:00Z", matter: "m", text: "Upload x: processing" }, { key: "note:1", at: "2026-10-03T08:00:00Z", matter: "m", text: "Note" }];
  const fresh = [{ key: "job:1:done", at: "2026-10-04T09:00:00Z", matter: "m", text: "Upload x: filed" }, { key: "note:1", at: "2026-10-03T08:00:00Z", matter: "m", text: "Note (fresh)" }];
  const out = merge(stored, fresh);
  assert.deepEqual(out.map((e) => e.key), ["job:1:done", "job:1:processing", "note:1"]);
  assert.equal(out.find((e) => e.key === "note:1")!.text, "Note (fresh)");
});
