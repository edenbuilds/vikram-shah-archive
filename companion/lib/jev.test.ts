import { test } from "node:test";
import assert from "node:assert/strict";
import { pick, systemOne, yes } from "./jev.ts";
import { rerank } from "./agent.ts";
import { suggestStage } from "./stage-suggest.ts";

// Jev is mocked here; scripts/jev-eval.ts measures the live model.
type Reply = { status?: number; body?: unknown; hang?: boolean };
function mockJev(replies: Reply[]) {
  const sent: { questions: Record<string, { criteria?: Record<string, unknown> }> }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    const r = replies.shift() ?? { status: 500 };
    if (r.hang) return new Promise((_, no) => init.signal!.addEventListener("abort", () => no(Object.assign(new Error("t"), { name: "TimeoutError" }))));
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return sent;
}
process.env.TYPESAFE_API_KEY = "test-key";
const hit = (id: number, text: string) => ({ id, doc_id: `d${id}`, page_start: 1, page_end: 1, text, similarity: 0.5, fts_rank: 0 });
const nouls = (xs: number[]) => ({ model: "jev-1.13.0", usage: { input_tokens: 99 }, answers: Object.fromEntries(xs.map((v, i) => [`p${i}`, { type: "noul", noul: v }])) });

test("a choice outside the offered ids is refused", () => {
  assert.equal(pick({ type: "choice", choice: "invented", probabilities: { invented: 1 }, confidence: 1 }, ["orders"]), null);
  assert.deepEqual(pick({ type: "choice", choice: "orders", probabilities: { orders: 0.7 }, confidence: 0.4 }, ["orders"]), { choice: "orders", probability: 0.7, confidence: 0.4 });
  assert.equal(yes({ type: "noul", noul: 1.5 }), null);
});

test("no key, server errors and timeouts fall back without throwing", async () => {
  const key = process.env.TYPESAFE_API_KEY; delete process.env.TYPESAFE_API_KEY;
  assert.equal((await systemOne("s", {}, "t")).log.fallback, "no key");
  process.env.TYPESAFE_API_KEY = key;
  const sent = mockJev([{ status: 503 }, { status: 503 }]);
  assert.equal((await systemOne("s", {}, "t")).log.fallback, "http 503");
  assert.equal(sent.length, 2); // one retry, then give up
  mockJev([{ hang: true }]);
  assert.equal((await systemOne("s", {}, "t", { timeoutMs: 50, retries: 0 })).log.fallback, "timeout");
});

test("rerank in eval mode records an order but returns the passages unchanged", async () => {
  mockJev([{ body: nouls([0.1, 0.9, 0.5]) }]);
  const hits = [hit(1, "a"), hit(2, "b"), hit(3, "c")];
  const r = await rerank("q", hits, "eval");
  assert.deepEqual(r.hits.map((h) => h.id), [1, 2, 3]);
  assert.deepEqual(r.log!.order, [1, 2, 0]);
  assert.equal(r.log!.input_tokens, 99);
});

test("rerank in on mode reorders without dropping any passage", async () => {
  mockJev([{ body: nouls([0.1, 0.9, 0.5]) }]);
  const r = await rerank("q", [hit(1, "a"), hit(2, "b"), hit(3, "c")], "on");
  assert.deepEqual(r.hits.map((h) => h.id), [2, 3, 1]);
});

test("rerank keeps the original order when an answer is missing or Jev is down", async () => {
  mockJev([{ body: nouls([0.1, 0.9]) }]); // one of three answers missing
  const r = await rerank("q", [hit(1, "a"), hit(2, "b"), hit(3, "c")], "on");
  assert.deepEqual(r.hits.map((h) => h.id), [1, 2, 3]);
  assert.equal(r.log!.fallback, "invalid answer");
  mockJev([{ status: 500 }, { status: 500 }]);
  assert.deepEqual((await rerank("q", [hit(1, "a"), hit(2, "b")], "on")).hits.map((h) => h.id), [1, 2]);
});

const stages = [{ id: "petition", title: "2. Petition & synopsis" }, { id: "orders", title: "6. Orders & judgments" }];
const doc = { id: "x", matter_id: "m", title: "Order dated 01-10-2026", sha256: "abc" };
const choice = (c: string) => ({ type: "choice", choice: c, probabilities: { [c]: 0.8 }, confidence: 0.6 });

test("a stage is suggested only when both option orders agree", async () => {
  const sent = mockJev([{ body: { model: "jev-1.13.0", answers: { fwd: choice("orders"), rev: choice("orders") } } }]);
  const s = await suggestStage(doc, "ORDER ...", stages);
  assert.equal(s.stage, "orders"); assert.equal(s.uncertain, false); assert.equal(s.probability, 0.8);
  assert.deepEqual(Object.keys(sent[0].questions.rev.criteria!), ["orders", "petition", "uncertain"]);
  mockJev([{ body: { model: "jev-1.13.0", answers: { fwd: choice("orders"), rev: choice("petition") } } }]);
  assert.equal((await suggestStage(doc, "", stages)).uncertain, true);
});

test("an invented stage id or an outage gives uncertain, never a guess", async () => {
  mockJev([{ body: { model: "jev-1.13.0", answers: { fwd: choice("appeal"), rev: choice("appeal") } } }]);
  const s = await suggestStage(doc, "", stages);
  assert.equal(s.stage, "uncertain"); assert.equal(s.log.fallback, "invalid answer");
  mockJev([{ status: 500 }, { status: 500 }]);
  assert.equal((await suggestStage(doc, "", stages)).stage, "uncertain");
});
