// Models over plain fetch. Reading, drafting and Ask run on xAI (grok-4.3: $1.25 in / $2.50 out per
// million, the cheapest general model there). Embeddings stay on OpenAI text-embedding-3-small:
// xAI has no embedding model, and every stored chunk vector is 1536-d from that model.
// 25-09-2026: the OpenAI account ran out of credit and took Ask, Telegram and reading orders down with it.

export const LLM_MODEL = process.env.LLM_MODEL || "grok-4.3";
// deepseek-* models go to DeepSeek, the rest to xAI; both serve the Responses API.
const provider = (model: string) => model.startsWith("deepseek")
  ? { url: "https://api.deepseek.com/v1", key: process.env.DEEPSEEK_API_KEY, name: "DeepSeek", console: "platform.deepseek.com" }
  : { url: "https://api.x.ai/v1", key: process.env.XAI_API_KEY, name: "xAI", console: "console.x.ai" };
export const CHAT_MODEL = LLM_MODEL;
export const EMBED_MODEL = "text-embedding-3-small";

export async function llm<T = unknown>(path: "responses", body: { model: string; [k: string]: unknown }): Promise<T> {
  const p = provider(body.model);
  if (!p.key) throw new Error(`${p.name} API key is not configured`);
  const r = await fetch(`${p.url}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    if (r.status === 402 || /credit|spending limit|exhausted|insufficient balance/i.test(text))
      throw new Error(`The ${p.name} account has no credit left, so the papers can't be read right now. Add credit at ${p.console} and try again.`);
    throw new Error(`model ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

type Out = { output?: { type: string; content?: { type?: string; text?: string }[] }[] };
export const outputText = (o: Out) =>
  (o.output ?? []).filter((x) => x.type === "message").flatMap((x) => x.content ?? []).map((c) => c.text ?? "").join("");

// Null when embeddings are unavailable: match_chunks then ranks on exact words alone.
export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
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
