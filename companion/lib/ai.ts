// Models over plain fetch. Reading, drafting and Ask run on xAI (grok-4.3: $1.25 in / $2.50 out per
// million, the cheapest general model there). Embeddings: Gemini through the AI Gateway (below).
// 25-09-2026: the OpenAI account ran out of credit and took Ask, Telegram and reading orders down with it.

export const LLM_MODEL = process.env.LLM_MODEL || "grok-4.3";
// The model name picks the provider; all four serve the Responses API.
//   deepseek-*      DeepSeek
//   openai.*        AWS Bedrock (Mumbai), bearer API key
//   vendor/model    Vercel AI Gateway (the deployment's OIDC token; free tier = small models only)
//   anything else   xAI
const provider = (model: string) =>
  model.startsWith("deepseek") ? { url: "https://api.deepseek.com/v1", key: process.env.DEEPSEEK_API_KEY, name: "DeepSeek", console: "platform.deepseek.com" }
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
// 04-10-2026: Bedrock (Luna 6) and the AI Gateway joined; the gateway's free tier serves small models only.
const BACKUPS = (process.env.LLM_BACKUPS || "deepseek-v4-pro,openai.gpt-6-luna,openai/gpt-5.4-nano").split(",").map((m) => m.trim()).filter(Boolean);
const dryUntil: Record<string, number> = {};

class Dry extends Error {}

async function call<T>(path: string, body: { model: string; [k: string]: unknown }): Promise<T> {
  const p = provider(body.model);
  if (p.key === "oidc") p.key = await gatewayKey();
  if (!p.key) throw new Dry(`${p.name} API key is not configured`);
  if ((dryUntil[p.name] ?? 0) > Date.now()) throw new Dry(`The ${p.name} account has no credit left`);
  const r = await fetch(`${p.url}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => { throw new Dry(`${p.name} unreachable: ${(e as Error).message}`); });
  if (!r.ok) {
    const text = await r.text();
    if (r.status === 402 || /credit|spending limit|exhausted|insufficient balance/i.test(text)) {
      dryUntil[p.name] = Date.now() + 10 * 60_000;
      throw new Dry(`The ${p.name} account has no credit left, so the papers can't be read right now. Add credit at ${p.console} and try again.`);
    }
    if (r.status !== 400) throw new Dry(`${p.name} ${r.status}: ${text.slice(0, 200)}`);
    throw new Error(`model ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

export async function llm<T = unknown>(path: "responses", body: { model: string; [k: string]: unknown }): Promise<T> {
  const chain = [body.model, ...BACKUPS.filter((m) => provider(m).name !== provider(body.model).name)];
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
