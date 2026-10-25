import test from "node:test";
import assert from "node:assert/strict";
import { bridgeable, pathFor, signBody, signedOk, spans } from "./bridge.ts";

test("a request signed with the shared secret passes and a tampered body or wrong secret does not", () => {
  const body = JSON.stringify({ folder: "Matter A", at: "2026-10-25T10:00:00Z" });
  const sig = signBody(body, "s3cret");
  assert.ok(signedOk(body, sig, "s3cret"));
  assert.ok(!signedOk(body.replace("A", "B"), sig, "s3cret"));
  assert.ok(!signedOk(body, sig, "other"));
  assert.ok(!signedOk(body, sig, ""));
  assert.ok(!signedOk(body, null, "s3cret"));
});

test("the same bytes land on the same path inside the matter's uploads, so sending a folder twice adds nothing", () => {
  const f = { sha256: "a".repeat(64), name: "Vakalatnama / signed?.pdf" };
  assert.equal(pathFor("m-1", f), pathFor("m-1", { ...f }));
  assert.ok(pathFor("m-1", f).startsWith("m-1/uploads/arya-aaaaaaaaaaaa-"));
  assert.ok(!pathFor("m-1", f).slice("m-1/uploads/".length).includes("/"));
});

test("only kinds the worker can turn into a PDF come over", () => {
  assert.ok(bridgeable({ name: "Order.PDF" }));
  assert.ok(!bridgeable({ name: "Arya Files.zip" }));
});

test("a split paper's source path gives back where its pages sit in the volume", () => {
  assert.deepEqual(spans("Appeal.pdf, pp. 3-5, p. 9", "Appeal.pdf"), [3, 4, 5, 9]);
  assert.deepEqual(spans("Appeal.pdf, p. 2", "Appeal.pdf"), [2]);
  assert.equal(spans("Other.pdf, pp. 1-2", "Appeal.pdf"), null);
  assert.equal(spans("Appeal.pdf", "Appeal.pdf"), null);
});
