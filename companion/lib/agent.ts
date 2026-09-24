import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./ai.ts";
import { verify, type Chunk, type Rejected, type Verified, type VerifiedClaim } from "./citations.ts";
import { MIN_SIMILARITY } from "./qa.ts";

// The Ask agent: it searches and reads the chosen sources as it needs to, then must hand in
// claims with quotes. Every quote is re-checked in code against the page text it names (or
// any page it saw); claims without a verbatim receipt are withheld and listed in the audit.
// All reads go through the caller's own client, so RLS decides what it can see.

export const AGENT_MODEL = process.env.AGENT_MODEL || "gpt-5.5";
const MAX_TURNS = 10;

export type Scope = { matterIds: string[]; docIds: string[] | null };
export type Step = { kind: "search" | "read" | "list" | "note"; text: string };
export type AgentResult = {
  status: "answered" | "not_in_corpus"; claims: VerifiedClaim[]; rejected: Rejected[];
  steps: Step[]; pagesRead: { doc_id: string; page: number }[]; model: string;
};
type Doc = { id: string; title: string; matter_id: string; page_count: number; stage: string };

const SYSTEM = `You answer an advocate's questions from her own case papers, using only the tools.
- Search, then read the pages you need. Quote only text you have seen in a tool result.
- Finish by calling final_answer. Every claim needs at least one citation: the paper id, the page,
  and a quote copied character for character from that page (8-400 characters, one contiguous span).
- Copy names, dates, amounts and case numbers exactly as printed. Never compute, total or convert.
- If the sources do not answer the question, call final_answer with status "not_in_papers" and no claims.
  Never fill a gap from general knowledge. Never guess.
- Keep claims short and factual: what the papers say, attributed to the paper ("The notice states…").
- Previous turns of this conversation are context only; re-check anything you rely on.`;

const fn = (name: string, description: string, parameters: object, strict = false) => ({ type: "function", name, description, parameters, strict });
const TOOLS = [
  fn("search_papers", "Search the chosen sources by meaning and exact words. Returns excerpts with paper id and page.",
    { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string" } } }),
  fn("read_pages", "Read the verbatim text of up to 5 consecutive pages of one paper.",
    { type: "object", additionalProperties: false, required: ["doc_id", "from_page", "to_page"], properties: { doc_id: { type: "string" }, from_page: { type: "integer" }, to_page: { type: "integer" } } }),
  fn("list_sources", "List the papers you may use (id, title, pages).", { type: "object", additionalProperties: false, properties: {} }),
  fn("final_answer", "Hand in the answer. Claims without verbatim quotes will be withheld.", {
    type: "object", additionalProperties: false, required: ["status", "claims"], properties: {
      status: { type: "string", enum: ["answered", "not_in_papers"] },
      claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "citations"], properties: {
        text: { type: "string" },
        citations: { type: "array", items: { type: "object", additionalProperties: false, required: ["doc_id", "page", "quote"], properties: {
          doc_id: { type: "string" }, page: { type: "integer" }, quote: { type: "string" } } } } } } } } }, true),
];

// OpenAI Responses API: chat completions refuses tools + reasoning on gpt-5.5. The
// conversation state lives server-side between turns (previous_response_id).
async function respond(input: unknown[], previous: string | null, final: boolean) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AGENT_MODEL, instructions: SYSTEM, input, tools: TOOLS, previous_response_id: previous ?? undefined,
      tool_choice: final ? { type: "function", name: "final_answer" } : "required",
      ...(AGENT_MODEL.startsWith("gpt-4") ? { temperature: 0 } : { reasoning: { effort: "low" } }),
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    if (/insufficient_quota/.test(body)) throw new Error("The OpenAI account has no credit left, so the papers can't be read right now. Add credit at platform.openai.com and try again.");
    throw new Error(`OpenAI ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.json() as Promise<{ id: string; output: { type: string; call_id?: string; name?: string; arguments?: string }[] }>;
}

export async function runAgent(db: SupabaseClient, question: string, scope: Scope, history: { q: string; a: string }[],
  onStep: (s: Step) => void): Promise<AgentResult> {
  const { data: docList } = scope.docIds
    ? await db.from("documents").select("id, title, matter_id, page_count, stage").in("id", scope.docIds)
    : await db.from("documents").select("id, title, matter_id, page_count, stage").in("matter_id", scope.matterIds).order("sort");
  const docs = new Map(((docList ?? []) as Doc[]).map((d) => [d.id, d]));
  const allowed = (id: string) => docs.has(id);
  const seen = new Map<string, Chunk>(); // "doc#page" or "chunk:id" -> text the agent was shown
  const pagesRead: { doc_id: string; page: number }[] = [];
  const steps: Step[] = [];
  const step = (s: Step) => { steps.push(s); onStep(s); };

  async function search(query: string) {
    step({ kind: "search", text: `Searching: ${query}` });
    const q = await embed(query);
    const { data: sem } = await db.rpc("match_chunks", { query_embedding: q, query_text: query, matter_ids: [...new Set([...docs.values()].map((d) => d.matter_id))], match_count: scope.docIds ? 40 : 10 });
    let hits = ((sem ?? []) as (Chunk & { similarity: number; fts_rank: number })[]).filter((h) => allowed(h.doc_id) && (h.similarity >= MIN_SIMILARITY || h.fts_rank > 0));
    if (scope.docIds) {
      // exact words inside the chosen papers, so a small selection is never crowded out by the rest of the matter
      const { data: lex } = await db.from("chunks").select("id, doc_id, page_start, page_end, text").in("doc_id", scope.docIds)
        .textSearch("tsv", query, { type: "websearch", config: "english" }).limit(8);
      const have = new Set(hits.map((h) => h.id));
      hits = [...hits, ...((lex ?? []) as Chunk[]).filter((l) => !have.has(l.id)).map((l) => ({ ...l, similarity: 0, fts_rank: 1 }))];
    }
    hits = hits.slice(0, 8);
    for (const h of hits) seen.set(`chunk:${h.id}`, h);
    if (!hits.length) return "No passages found in the chosen sources.";
    return hits.map((h) => `[paper ${h.doc_id}, p. ${h.page_start}${h.page_end !== h.page_start ? `-${h.page_end}` : ""}] ${docs.get(h.doc_id)?.title}\n${h.text.slice(0, 1200)}`).join("\n\n");
  }

  async function read(doc_id: string, from: number, to: number) {
    const d = docs.get(doc_id);
    if (!d) return `Paper ${doc_id} is not among the chosen sources.`;
    const a = Math.max(1, from), b = Math.min(d.page_count, Math.max(a, to), a + 4);
    step({ kind: "read", text: `Reading ${d.title}, ${a === b ? `p. ${a}` : `pp. ${a}-${b}`}` });
    const { data } = await db.from("document_pages").select("page_no, text").eq("doc_id", doc_id).gte("page_no", a).lte("page_no", b).order("page_no");
    return (data ?? []).map((p) => {
      seen.set(`${doc_id}#${p.page_no}`, { id: 0, doc_id, page_start: p.page_no, page_end: p.page_no, text: p.text ?? "" });
      pagesRead.push({ doc_id, page: p.page_no });
      return `--- paper ${doc_id}, p. ${p.page_no} ---\n${p.text?.trim() || "[ILLEGIBLE: no text on this page]"}`;
    }).join("\n\n");
  }

  const list = () => {
    step({ kind: "list", text: `Looking at the ${docs.size} sources` });
    return [...docs.values()].slice(0, 300).map((d) => `${d.id} | ${d.title} | ${d.page_count} pp.`).join("\n");
  };

  const scopeNote = scope.docIds
    ? `The advocate chose these ${docs.size} papers as sources; use nothing else:\n${[...docs.values()].map((d) => `- ${d.id}: ${d.title} (${d.page_count} pp.)`).join("\n")}`
    : `Sources: all ${docs.size} papers in ${scope.matterIds.length === 1 ? "this matter" : `her ${scope.matterIds.length} matters`}. Use list_sources to see them.`;
  let input: unknown[] = [
    ...history.flatMap((h) => [{ role: "user", content: h.q }, { role: "assistant", content: h.a }]),
    { role: "user", content: `${scopeNote}\n\nQuestion: ${question}` },
  ];
  type Answer = { status: string; claims: { text: string; citations: { doc_id: string; page: number; quote: string }[] }[] };
  const titles = Object.fromEntries([...docs.values()].map((d) => [d.id, d.title]));

  // Receipts: fetch every cited page, then check each quote against real page text.
  async function check(ans: Answer): Promise<Verified> {
    const cited = [...new Set(ans.claims.flatMap((c) => c.citations.filter((x) => allowed(x.doc_id)).map((x) => `${x.doc_id}#${x.page}`)))];
    for (const key of cited.filter((k) => !seen.has(k))) {
      const [doc_id, page] = key.split("#");
      const { data } = await db.from("document_pages").select("text").eq("doc_id", doc_id).eq("page_no", Number(page)).maybeSingle();
      if (data) seen.set(key, { id: 0, doc_id, page_start: Number(page), page_end: Number(page), text: data.text ?? "" });
    }
    const chunks = [...seen.entries()].map(([k, c], i) => ({ ...c, id: i + 1, key: k }));
    const idOf = new Map(chunks.map((c) => [c.key, c.id]));
    return verify({
      status: "answered",
      claims: ans.claims.map((c) => ({ text: c.text, citations: c.citations.filter((x) => allowed(x.doc_id)).map((x) => ({ chunk_id: idOf.get(`${x.doc_id}#${x.page}`) ?? -1, quote: x.quote })) })),
    }, chunks, titles);
  }

  let previous: string | null = null;
  let result: Verified | null = null;
  let repaired = false;
  for (let turn = 0; turn < MAX_TURNS && !result; turn++) {
    const res = await respond(input, previous, turn >= MAX_TURNS - 2);
    previous = res.id;
    input = [];
    for (const call of res.output.filter((o) => o.type === "function_call")) {
      const args = JSON.parse(call.arguments || "{}");
      let out = "";
      if (call.name === "final_answer") {
        const ans = args as Answer;
        if (ans.status !== "answered" || !ans.claims?.length) { result = { status: "not_in_corpus", claims: [], rejected: [] }; out = "received"; }
        else {
          step({ kind: "note", text: repaired ? "Re-checking the corrected quotes" : "Checking every quote against the page" });
          const v = await check(ans);
          if (!v.rejected.length || repaired) result = v;
          else {
            // one chance to repair: say exactly what failed; the fix goes through the same check
            repaired = true;
            step({ kind: "note", text: `${v.rejected.length} line(s) lacked a verbatim receipt; asking for exact quotes` });
            out = `These claims failed verification and will be withheld unless fixed:\n${v.rejected.map((r) => `- "${r.text}": ${r.reason}`).join("\n")}\n` +
              "Call final_answer again with ALL claims (the passing ones too). For each failed claim, quote a longer exact span from the page that contains every date, number and name the claim states, or drop those details from the claim, or drop the claim.";
          }
        }
      }
      else if (call.name === "search_papers") out = await search(String(args.query ?? question));
      else if (call.name === "read_pages") out = await read(String(args.doc_id), Number(args.from_page), Number(args.to_page));
      else if (call.name === "list_sources") out = list();
      input.push({ type: "function_call_output", call_id: call.call_id, output: (out || "ok").slice(0, 24000) });
    }
  }
  const v = result ?? { status: "not_in_corpus" as const, claims: [], rejected: [] };
  return { ...v, steps, pagesRead, model: AGENT_MODEL };
}
