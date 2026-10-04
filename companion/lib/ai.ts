// Models over plain fetch. Ask, drafting and Telegram run on Kimi K3 through Bedrock's Flex tier (04-10-2026:
// $1.50 in / $7.50 out per million, paid from AWS credits; it passed 5/5 agent checks). Reading orders use READING_MODEL. Embeddings: Gemini through the AI Gateway (below).
// 25-09-2026: the OpenAI account ran out of credit and took Ask, Telegram and reading orders down with it.

export const LLM_MODEL = process.env.LLM_MODEL || "bedrock:global.moonshotai.kimi-k3@flex";
// The model name picks the provider; all four serve the Responses API.
//   deepseek-*      DeepSeek
//   openai.*        AWS Bedrock (Mumbai), bearer API key
//   bedrock:<id>    AWS Bedrock Converse (us-east-1), same key; Claude and Kimi live only there
//   vendor/model    Vercel AI Gateway (the deployment's OIDC token; free tier = small models only)
//   anything else   xAI
const provider = (model: string) =>
  model.startsWith("deepseek") ? { url: "https://api.deepseek.com/v1", key: process.env.DEEPSEEK_API_KEY, name: "DeepSeek", console: "platform.deepseek.com" }
  : model.startsWith("bedrock:") ? { url: `https://bedrock-runtime.${process.env.BEDROCK_CONVERSE_REGION || "us-east-1"}.amazonaws.com`, key: process.env.AWS_BEARER_TOKEN_BEDROCK, name: "Bedrock Converse", console: "the AWS console" }
  : model.startsWith("openai.") ? { url: `https://bedrock-runtime.${process.env.BEDROCK_REGION || "ap-south-1"}.amazonaws.com/openai/v1`, key: process.env.AWS_BEARER_TOKEN_BEDROCK, name: "Bedrock", console: "the AWS console" }
  : model.includes("/") ? { url: GATEWAY, key: "oidc", name: "AI Gateway", console: "vercel.com/ai" }
  : { url: "https://api.x.ai/v1", key: process.env.XAI_API_KEY, name: "xAI", console: "console.x.ai" };
export const CHAT_MODEL = LLM_MODEL;
// 04-10-2026: OpenAI out of credit again, so vectors come from Gemini through the gateway (free tier
// serves it), cut to 1536-d to fit the stored column. Every chunk was re-embedded the same day.
export const EMBED_MODEL = "google/gemini-embedding-001";
const GATEWAY = "https://ai-gateway.vercel.sh/v1";

// On Vercel the OIDC token arrives per request in a header; locally it comes from `vercel env pull`.
async function gatewayKey(): Promise<string | undefined> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    const { headers } = await import("next/headers");
    const t = (await headers()).get("x-vercel-oidc-token");
    if (t) return t;
  } catch { /* outside a request (scripts, after()): fall back to the env token */ }
  return process.env.VERCEL_OIDC_TOKEN;
}

// 02-10-2026: the xAI account ran dry and took Ask, briefs and reading down again (OpenAI did the same
// on 25-09-2026). When a provider is out of credit or down, the same request goes down this list.
// 04-10-2026: Kimi K3 (Bedrock) became the main model; Opus 4.6 (Bedrock) and the AI Gateway's free tier
// (small models only) joined the list. Main: Kimi on Flex. Order after it: Kimi standard (Flex can be
// throttled at peak), DeepSeek, Opus 4.6, gateway.
const BACKUPS = (process.env.LLM_BACKUPS || "bedrock:global.moonshotai.kimi-k3,deepseek-v4-pro,bedrock:global.anthropic.claude-opus-4-6-v1,openai/gpt-5.4-nano").split(",").map((m) => m.trim()).filter(Boolean);
const dryUntil: Record<string, number> = {};

class Dry extends Error {}

async function call<T>(path: string, body: { model: string; [k: string]: unknown }): Promise<T> {
  const p = provider(body.model);
  if (p.key === "oidc") p.key = await gatewayKey();
  if (!p.key) throw new Dry(`${p.name} API key is not configured`);
  if ((dryUntil[p.name] ?? 0) > Date.now()) throw new Dry(`The ${p.name} account has no credit left`);
  if ((dryUntil[body.model] ?? 0) > Date.now()) throw new Dry(`${body.model} is not available to this account right now`);
  const conv = body.model.startsWith("bedrock:");
  // "bedrock:<id>@flex" asks for Bedrock's Flex tier: half price, measured ~15% slower (04-10-2026, Kimi K3).
  const [id, tier] = body.model.slice(8).split("@");
  const r = await fetch(conv ? `${p.url}/model/${encodeURIComponent(id)}/converse` : `${p.url}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(conv ? { ...toConverse(body), ...(tier && { serviceTier: { type: tier } }) } : body),
    // 04-10-2026: Kimi K3 thinks for up to ~70 s on a long answer; past 2 minutes the next model gets a turn
    // inside the 300 s function limit instead of the whole request timing out.
    signal: AbortSignal.timeout(120_000),
  }).catch((e) => { throw new Dry(`${p.name} unreachable: ${(e as Error).message}`); });
  if (!r.ok) {
    const text = await r.text();
    if (r.status === 402 || /credit|spending limit|exhausted|insufficient balance/i.test(text)) {
      dryUntil[p.name] = Date.now() + 10 * 60_000;
      throw new Dry(`The ${p.name} account has no credit left, so the papers can't be read right now. Add credit at ${p.console} and try again.`);
    }
    // 04-10-2026: Bedrock answers 403 for a model the account can't use (Opus 4.6 until a card is on file);
    // skip that model, not the provider, so Kimi on the same key still runs.
    if (r.status === 403) dryUntil[body.model] = Date.now() + 10 * 60_000;
    if (r.status !== 400) throw new Dry(`${p.name} ${r.status}: ${text.slice(0, 200)}`);
    throw new Error(`model ${r.status}: ${text.slice(0, 300)}`);
  }
  return (conv ? fromConverse(await r.json(), !!(body.text as Fmt)?.format) : r.json()) as Promise<T>;
}

// Bedrock Converse <-> the Responses shape the rest of the app speaks (04-10-2026: Opus 4.6 and Kimi K3
// are not on Bedrock's OpenAI-compatible endpoints). Covers what we send: instructions, string or item
// input, function tools and a JSON schema. ponytail: the schema goes in the prompt, not Converse's
// structured output; the JSON is cut from the reply and the callers still parse and check it.
type Fmt = { format?: { schema?: object } } | undefined;
type Msg = { role: "user" | "assistant"; content: object[] };
export function toConverse(b: { [k: string]: unknown }) {
  const schema = (b.text as Fmt)?.format?.schema;
  const system = [b.instructions, schema && `Reply with only one JSON object that matches this JSON Schema, no prose and no code fences:\n${JSON.stringify(schema)}`].filter(Boolean).join("\n\n");
  const msgs: Msg[] = [];
  const add = (role: Msg["role"], part: object) => {
    const last = msgs.at(-1);
    if (last?.role === role) last.content.push(part); else msgs.push({ role, content: [part] });
  };
  const items = typeof b.input === "string" ? [{ role: "user", content: b.input }] : (b.input as Record<string, unknown>[]);
  for (const it of items) {
    if (it.type === "function_call") add("assistant", { toolUse: { toolUseId: it.call_id, name: it.name, input: JSON.parse(String(it.arguments || "{}")) } });
    else if (it.type === "function_call_output") add("user", { toolResult: { toolUseId: it.call_id, content: [{ text: String(it.output) }] } });
    else if (it.role === "user" || it.role === "assistant") {
      const text = typeof it.content === "string" ? it.content : (it.content as { text?: string }[]).map((c) => c.text ?? "").join("");
      if (text) add(it.role, { text });
    }
  }
  const tools = b.tools as { name: string; description?: string; parameters: object }[] | undefined;
  return {
    ...(system && { system: [{ text: system }] }), messages: msgs, inferenceConfig: { maxTokens: 8000 },
    ...(tools?.length && { toolConfig: { tools: tools.map((t) => ({ toolSpec: { name: t.name, description: t.description ?? t.name, inputSchema: { json: t.parameters } } })), toolChoice: { auto: {} } } }),
  };
}

export function fromConverse(d: { output?: { message?: { content?: Record<string, any>[] } } }, json: boolean) {
  const output: object[] = [];
  for (const c of d.output?.message?.content ?? []) {
    if (c.text) {
      const t = json ? (c.text as string).slice(c.text.indexOf("{"), c.text.lastIndexOf("}") + 1) : c.text;
      output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: t }] });
    } else if (c.toolUse) output.push({ type: "function_call", call_id: c.toolUse.toolUseId, name: c.toolUse.name, arguments: JSON.stringify(c.toolUse.input ?? {}) });
  }
  return { output };
}

export async function llm<T = unknown>(path: "responses", body: { model: string; [k: string]: unknown }): Promise<T> {
  // Every backup but the model itself; a provider or model known to be dry fails fast in call().
  const chain = [body.model, ...BACKUPS.filter((m) => m !== body.model)];
  const failed: string[] = [];
  for (const model of chain) {
    try {
      return await call<T>(path, { ...body, model });
    } catch (e) {
      if (!(e instanceof Dry) && model === body.model) throw e; // a bad request is ours; a backup's quirk is not
      failed.push((e as Error).message);
    }
  }
  throw new Error(failed.length > 1 ? `${failed[0]} The backup models are unavailable too (${failed.slice(1).join("; ")}).` : failed[0]);
}

type Out = { output?: { type: string; content?: { type?: string; text?: string }[] }[] };
export const outputText = (o: Out) =>
  (o.output ?? []).filter((x) => x.type === "message").flatMap((x) => x.content ?? []).map((c) => c.text ?? "").join("");

// Null when embeddings are unavailable: match_chunks then ranks on exact words alone.
export async function embed(text: string): Promise<number[] | null> {
  const key = await gatewayKey();
  if (!key) return null;
  const r = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000), dimensions: 1536 }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return r?.ok ? (await r.json()).data[0].embedding : null;
}

// Responses API with a strict schema: DeepSeek has no json_schema on chat completions.
export async function jsonChat<T>(system: string, user: string, name: string, schema: object): Promise<T> {
  const d = await llm<Out>("responses", {
    model: CHAT_MODEL, instructions: system, input: user, reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name, strict: true, schema } },
  });
  return JSON.parse(outputText(d)) as T;
}
