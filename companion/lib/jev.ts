// TypeSafe Jev (https://docs.typesafe.ai/api): bounded judgments over text, never transcripts.
// Used for two advisory jobs: reordering Ask's search passages and suggesting a paper's stage.
// Every call is optional: on a timeout, an error or an answer outside the allowed ids, the caller
// keeps the existing path. Choices are checked in code; nothing here reads or writes documents.

export const JEV_MODEL = "jev-1.13.0"; // pinned: thresholds and evals were run against this version
const URL = "https://api.typesafe.ai/v1/systemone";

export type Mode = "off" | "eval" | "on";
export const mode = (name: "JEV_RERANK" | "JEV_STAGES"): Mode => {
  const v = (process.env[name] ?? "off").toLowerCase();
  return v === "on" || v === "eval" ? v : "off";
};

export type Noul = { type: "noul"; instructions: string | object; criteria?: { true?: string; false?: string } };
export type Choice = { type: "choice"; instructions: string | object; criteria: Record<string, string | null> };
type Answer = { type: "noul"; noul: number } | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };

// What gets recorded: ids, sizes and timings, never the text that was sent.
export type JevLog = { model: string; schema: string; ms: number; input_tokens: number; fallback: string | null };

export async function systemOne(state: unknown, questions: Record<string, Noul | Choice>, schema: string,
  { timeoutMs = 8000, retries = 1 } = {}): Promise<{ answers: Record<string, Answer>; log: JevLog } | { answers: null; log: JevLog }> {
  const t0 = Date.now();
  const log = (fallback: string | null, model = JEV_MODEL, input_tokens = 0): JevLog => ({ model, schema, ms: Date.now() - t0, input_tokens, fallback });
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return { answers: null, log: log("no key") };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: JEV_MODEL, state, questions }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.status === 429 || r.status >= 500) {
        if (attempt < retries) { await new Promise((w) => setTimeout(w, Math.min(2000, Number(r.headers.get("retry-after") ?? 0.5) * 1000))); continue; }
        return { answers: null, log: log(`http ${r.status}`) };
      }
      if (!r.ok) return { answers: null, log: log(`http ${r.status}`) };
      const d = await r.json() as { model: string; answers: Record<string, Answer>; usage?: { input_tokens?: number } };
      return { answers: d.answers ?? {}, log: log(null, d.model, d.usage?.input_tokens ?? 0) };
    } catch (e) {
      if (attempt >= retries) return { answers: null, log: log((e as Error).name === "TimeoutError" ? "timeout" : "network") };
    }
  }
  return { answers: null, log: log("unreachable") };
}

// A choice answer is used only if it is one of the ids offered (the model can't invent a stage).
export function pick(a: Answer | undefined, allowed: string[]): { choice: string; probability: number; confidence: number } | null {
  if (!a || a.type !== "choice" || !allowed.includes(a.choice)) return null;
  const probability = a.probabilities?.[a.choice];
  if (typeof probability !== "number" || typeof a.confidence !== "number") return null;
  return { choice: a.choice, probability, confidence: a.confidence };
}

export const yes = (a: Answer | undefined): number | null => (a && a.type === "noul" && typeof a.noul === "number" && a.noul >= 0 && a.noul <= 1 ? a.noul : null);
