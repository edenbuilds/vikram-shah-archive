// OpenAI over plain fetch: embeddings for retrieval, JSON-schema chat for drafting.
// Temperature 0 and strict schemas; every output is then re-verified in code.

const KEY = () => {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not configured");
  return k;
};
export const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";
export const EMBED_MODEL = "text-embedding-3-small";

async function post(path: string, body: unknown) {
  const r = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const body = await r.text();
    if (/insufficient_quota/.test(body)) throw new Error("The OpenAI account has no credit left, so the papers can't be read right now. Add credit at platform.openai.com and try again.");
    throw new Error(`OpenAI ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

export async function embed(text: string): Promise<number[]> {
  const d = await post("embeddings", { model: EMBED_MODEL, input: text.slice(0, 8000) });
  return d.data[0].embedding;
}

export async function jsonChat<T>(system: string, user: string, name: string, schema: object): Promise<T> {
  const d = await post("chat/completions", {
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
