// Source-pinned Q&A. Retrieval runs through the caller's Supabase client, so in the
// app RLS limits it to the advocate's matters. The model may only restate retrieved
// excerpts; verify() then drops anything not pinned to a verbatim quote.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_MODEL, embed, jsonChat } from "./ai.ts";
import { verify, type Chunk, type ModelAnswer, type Verified } from "./citations.ts";

type Hit = Chunk & { matter_id: string; similarity: number; fts_rank: number };

// ponytail: fixed floor tuned on this corpus with scripts/eval-qa.ts; re-tune per corpus if refusals look wrong.
export const MIN_SIMILARITY = 0.3;
const K = 12;

const SYSTEM = `You are the clerk's retrieval aid for an advocate's own case papers. You are not a lawyer and you give no opinions.
Answer ONLY from the numbered excerpts supplied. Rules, all mandatory:
1. Every claim cites at least one excerpt by its chunk_id, with a "quote" copied character-for-character from that excerpt (one contiguous span, 8-400 characters). Never stitch, paraphrase, or correct OCR inside a quote.
2. Copy every name, date, amount, and case number exactly as printed. Do not compute, convert, total, or round anything. Every date, number, or amount in a claim must appear inside that claim's own quote. You may name the cited paper by its title as shown in the excerpt header. Never repeat case numbers, dates, or figures from the question unless they appear in your quote.
3. Attribute, don't find: write what a paper states ("The Statement of Claim states ..."), never as established fact, never as a finding, prediction, recommendation, or advice.
4. If the excerpts do not answer the question, or only partly, set status "not_in_corpus" for what is missing. Do not fill gaps from general legal knowledge. Do not infer.
5. If an excerpt shows [ILLEGIBLE], say the paper is illegible there instead of guessing.
Keep claims short; one fact per claim.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "claims"],
  properties: {
    status: { type: "string", enum: ["answered", "not_in_corpus"] },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "citations"],
        properties: {
          text: { type: "string" },
          citations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["chunk_id", "quote"],
              properties: { chunk_id: { type: "integer" }, quote: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

export type QaResult = Verified & {
  model: string;
  retrieved: { id: number; doc_id: string; page_start: number; page_end: number; similarity: number; fts_rank: number }[];
  gate?: string;
};

export async function answer(db: SupabaseClient, question: string, matterIds: string[]): Promise<QaResult> {
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: await embed(question),
    query_text: question,
    matter_ids: matterIds,
    match_count: K,
  });
  if (error) throw error;
  const hits = (data ?? []) as Hit[];
  const retrieved = hits.map(({ id, doc_id, page_start, page_end, similarity, fts_rank }) => ({ id, doc_id, page_start, page_end, similarity, fts_rank }));
  const best = Math.max(0, ...hits.map((h) => h.similarity));
  if (!hits.length || (best < MIN_SIMILARITY && !hits.some((h) => h.fts_rank > 0))) {
    return { status: "not_in_corpus", claims: [], rejected: [], model: "none", retrieved, gate: `retrieval below floor (best similarity ${best.toFixed(2)})` };
  }
  const { data: docs } = await db.from("documents").select("id, title").in("id", [...new Set(hits.map((h) => h.doc_id))]);
  const titles = Object.fromEntries((docs ?? []).map((d) => [d.id, d.title]));
  const excerpts = hits
    .map((h) => `[chunk_id ${h.id}] ${titles[h.doc_id] ?? h.doc_id} (${h.doc_id}), ${h.page_start === h.page_end ? `p. ${h.page_start}` : `pp. ${h.page_start}-${h.page_end}`}\n${h.text}`)
    .join("\n\n---\n\n");
  const out = await jsonChat<ModelAnswer>(SYSTEM, `Question: ${question}\n\nExcerpts:\n\n${excerpts}`, "pinned_answer", SCHEMA);
  return { ...verify(out, hits, titles), model: CHAT_MODEL, retrieved };
}
