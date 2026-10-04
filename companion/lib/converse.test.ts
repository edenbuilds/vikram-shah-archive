import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, fromConverse, toConverse } from "./ai.ts";

test("a tool-using Responses transcript becomes alternating Converse turns and back", () => {
  const c = toConverse({
    instructions: "sys", tools: [{ type: "function", name: "search_papers", parameters: { type: "object" } }],
    input: [
      { role: "user", content: "q" },
      { type: "reasoning", summary: [] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "looking" }] },
      { type: "function_call", call_id: "t1", name: "search_papers", arguments: '{"query":"rent"}' },
      { type: "function_call_output", call_id: "t1", output: "hits" },
      { role: "user", content: "Use the tools" },
    ],
  }) as { system: { text: string }[]; messages: { role: string; content: Record<string, any>[] }[]; toolConfig: { tools: unknown[] } };
  assert.equal(c.system[0].text, "sys");
  assert.deepEqual(c.messages.map((m) => m.role), ["user", "assistant", "user"]);
  assert.deepEqual(c.messages[1].content[1].toolUse, { toolUseId: "t1", name: "search_papers", input: { query: "rent" } });
  assert.equal(c.messages[2].content[0].toolResult.toolUseId, "t1");
  assert.equal(c.toolConfig.tools.length, 1);

  const out = fromConverse({ output: { message: { content: [{ reasoningContent: {} }, { text: "x" }, { toolUse: { toolUseId: "t2", name: "final_answer", input: { a: 1 } } }] } } }, false).output;
  assert.deepEqual(out, [
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "x" }] },
    { type: "function_call", call_id: "t2", name: "final_answer", arguments: '{"a":1}' },
  ]);
});

test("a JSON-schema request puts the schema in the prompt and cuts the object out of the reply", () => {
  const c = toConverse({ instructions: "sys", input: "q", text: { format: { type: "json_schema", schema: { type: "object" } } } }) as { system: { text: string }[] };
  assert.match(c.system[0].text, /JSON Schema/);
  const out = fromConverse({ output: { message: { content: [{ text: 'Sure:\n```json\n{"a":1}\n```' }] } } }, true).output as { content: { text: string }[] }[];
  assert.equal(out[0].content[0].text, '{"a":1}');
});

test("when the main model and the first backup fail, the next backup answers and a 403 model is skipped next time", async () => {
  process.env.AWS_BEARER_TOKEN_BEDROCK = "k"; process.env.DEEPSEEK_API_KEY = "k";
  const { llm } = await import("./ai.ts");
  const hits: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url); hits.push(u.includes("kimi") ? "kimi" : u.includes("opus") ? "opus" : u.includes("deepseek") ? "deepseek" : "other");
    if (u.includes("kimi")) return new Response("busy", { status: 503 });
    if (u.includes("deepseek")) return new Response("down", { status: 500 });
    if (u.includes("opus")) return new Response(JSON.stringify({ output: { message: { content: [{ text: "from opus" }] } } }), { status: 200 });
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  try {
    const r = await llm<{ output: { content: { text: string }[] }[] }>("responses", { model: "bedrock:global.moonshotai.kimi-k3", input: "q" });
    assert.equal(r.output[0].content[0].text, "from opus");
    assert.deepEqual(hits, ["kimi", "deepseek", "opus"]);
  } finally { globalThis.fetch = real; }
});

test("final_answer claims sent as JSON text are read the same as an array", async () => {
  const { listArg } = await import("./agent.ts");
  const claims = [{ text: "Filed on 12-06-2026", citations: [{ doc_id: "a", page: 2, quote: "12-06-2026" }] }];
  assert.deepEqual(listArg(JSON.stringify(claims)), claims);
  assert.deepEqual(listArg(claims), claims);
  assert.deepEqual(listArg("not json"), []);
  assert.deepEqual(listArg(undefined), []);
});

test("a model's slips in JSON are repaired and prose braces around the object are ignored", () => {
  assert.deepEqual(JSON.parse(extractJson('Per clause {7}: {"a":"x {y}","b":[1,2]} (see {note})')), { a: "x {y}", b: [1, 2] });
  assert.deepEqual(JSON.parse(extractJson('{"q":"line one\nline two\ttab"}')), { q: "line one\nline two\ttab" });
  assert.deepEqual(JSON.parse(extractJson('```json\n{"a":[1,2,],"b":{"c":1,},}\n```')), { a: [1, 2], b: { c: 1 } });
  assert.equal(JSON.parse(extractJson('{"q":"say \\"hi\\" } now"}')).q, 'say "hi" } now');
});

test("an answer cut off mid-string is not passed on as a complete object", () => {
  assert.throws(() => JSON.parse(extractJson('{"parts":[{"heading":"A","sentences":[{"text":"cut off here')));
});

test("a JSON answer that hit the token limit is asked for again with more room", async () => {
  process.env.AWS_BEARER_TOKEN_BEDROCK = "k";
  const { llm } = await import("./ai.ts");
  const seen: number[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init: { body: string }) => {
    const sent = JSON.parse(init.body);
    seen.push(sent.inferenceConfig.maxTokens);
    const done = sent.inferenceConfig.maxTokens > 8000;
    return new Response(JSON.stringify({ stopReason: done ? "end_turn" : "max_tokens", output: { message: { content: [{ text: done ? '{"ok":true}' : '{"parts":[{"x":"cut' }] } } }), { status: 200 });
  }) as typeof fetch;
  try {
    const out = await llm<{ output: { content: { text: string }[] }[] }>("responses", { model: "bedrock:test-model", input: "q", text: { format: { type: "json_schema", schema: { type: "object" } } } });
    assert.equal(out.output[0].content[0].text, '{"ok":true}');
    assert.deepEqual(seen, [8000, 32000]);
  } finally { globalThis.fetch = real; }
});
