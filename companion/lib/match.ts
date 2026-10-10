import type { SupabaseClient } from "@supabase/supabase-js";

// 10-10-2026: Ask answered "not in the papers" and Telegram answers went wrong. match_chunks reads every chunk of the
// matters it is given, and Supabase cancels any statement after 8 s. With the database cache cold (17 matters, 17,474
// chunks) one call over all matters took longer than that and came back as an error; the callers ignored the error, so a
// timeout looked like "no hits". The same scan matter by matter takes 0.5 to 3.5 s each, and a failed matter is retried
// once (the first try has already pulled its pages into memory).
// Not byte-identical to one call: each SQL call keeps only its own top 30 by meaning and top 30 by exact words, so a row
// is scored on both signals more often when matters are searched alone. Checked live on 10-10-2026: every row scores at
// least as high as in the single call (best 0.177 against 0.115 for "possession"), and the single call itself failed on a cold cache.
type Row = { similarity: number; fts_rank: number };
const AT_ONCE = 6;

// Same ordering as the SQL: vector similarity plus the exact-word rank, capped at 0.5.
const score = (r: Row) => r.similarity + Math.min(r.fts_rank, 0.5);
export const mergeHits = <T extends Row>(groups: T[][], count: number): T[] => groups.flat().sort((a, b) => score(b) - score(a)).slice(0, count);

export async function matchChunks<T extends Row = Row & Record<string, unknown>>(
  db: SupabaseClient,
  a: { embedding: number[] | null; text: string; matterIds: string[]; count: number },
): Promise<T[]> {
  const ids = [...new Set(a.matterIds)];
  const one = async (id: string): Promise<T[]> => {
    for (let attempt = 0; ; attempt++) {
      const { data, error } = await db.rpc("match_chunks", { query_embedding: a.embedding, query_text: a.text, matter_ids: [id], match_count: a.count });
      if (!error) return (data ?? []) as T[];
      console.error(`match_chunks failed for ${id} (try ${attempt + 1}): ${error.code ?? ""} ${error.message}`);
      // Never answer "not in the papers" because the search failed.
      if (attempt === 1) throw new Error("The search was too slow just now. Please ask again in a minute.");
      await new Promise((r) => setTimeout(r, 400));
    }
  };
  const groups: T[][] = [];
  for (let i = 0; i < ids.length; i += AT_ONCE) groups.push(...(await Promise.all(ids.slice(i, i + AT_ONCE).map(one))));
  return mergeHits(groups, a.count);
}
