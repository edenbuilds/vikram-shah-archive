// Models over plain fetch. Reading, drafting and Ask run on xAI (grok-4.3: $1.25 in / $2.50 out per
// million, the cheapest general model there). Embeddings stay on OpenAI text-embedding-3-small:
// xAI has no embedding model, and every stored chunk vector is 1536-d from that model.
// 25-09-2026: the OpenAI account ran out of credit and took Ask, Telegram and reading orders down with it.

export const LLM_MODEL = process.env.LLM_MODEL || "grok-4.3";
export const CHAT_MODEL = LLM_MODEL;
export const EMBED_MODEL = "text-embedding-3-small";

const NO_CREDIT = "The xAI account has no credit left, so the papers can't be read right now. Add credit at console.x.ai and try again.";

export async function llm<T = unknown>(path: "responses" | "chat/completions", body: object): Promise<T> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is not configured");
  const r = await fetch(`https://api.x.ai/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    if (/credit|spending limit|exhausted/i.test(text)) throw new Error(NO_CREDIT);
    throw new Error(`model ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

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

export async function jsonChat<T>(system: string, user: string, name: string, schema: object): Promise<T> {
  const d = await llm<{ choices: { message: { content: string } }[] }>("chat/completions", {
    model: CHAT_MODEL,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return JSON.parse(d.choices[0].message.content) as T;
}
