import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonChat } from "./ai.ts";

// "In the Shetty withdrawal application, why…" -> which matter and which papers she means.
// The model may only pick ids from her real list; anything it returns that isn't on the list is
// dropped. Nothing named -> the whole matter (or all her matters).
export type Resolved = { matterIds: string[]; docIds: string[] | null; label: string };

const SYSTEM = `You map an advocate's message to the case papers it refers to. You get her matters and each
matter's papers (id | title). Return the matter she means (or "" if none is clear) and the ids of the
specific papers she names or clearly refers to ("the withdrawal application", "Exhibit K", "the notice").
Pick the paper she names itself (e.g. "the reply of respondent 1" is the affidavit in reply, not its
exhibits); add its exhibits only when her words point to them too, or when there is more than one
paper of that name (then pick all of them). Return no paper ids when she refers to a matter generally
or to no paper. Never invent ids.`;

export async function resolveScope(db: SupabaseClient, message: string, context: string, matterIds: string[]): Promise<Resolved> {
  const [{ data: ms }, { data: ds }] = await Promise.all([
    db.from("matters").select("id, title, cause").in("id", matterIds),
    db.from("documents").select("id, title, matter_id").in("matter_id", matterIds).order("sort"),
  ]);
  const listing = (ms ?? []).map((m) => `MATTER ${m.id} | ${m.title}${m.cause ? ` | ${m.cause}` : ""}\n${(ds ?? []).filter((d) => d.matter_id === m.id).map((d) => `  ${d.id} | ${d.title}`).join("\n")}`).join("\n\n");
  let got: { matter_id: string; doc_ids: string[] } = { matter_id: "", doc_ids: [] };
  try {
    got = await jsonChat(SYSTEM, `${listing}\n\n${context ? `EARLIER IN THE CHAT:\n${context.slice(0, 1500)}\n\n` : ""}MESSAGE:\n${message}`, "scope", {
      type: "object", additionalProperties: false, required: ["matter_id", "doc_ids"],
      properties: { matter_id: { type: "string" }, doc_ids: { type: "array", items: { type: "string" } } },
    });
  } catch { /* fall back to everything she can see */ }
  const docs = (ds ?? []).filter((d) => got.doc_ids.includes(d.id));
  const matter = (ms ?? []).find((m) => m.id === got.matter_id) ?? (docs.length ? (ms ?? []).find((m) => m.id === docs[0].matter_id) : undefined);
  if (docs.length) return { matterIds: [...new Set(docs.map((d) => d.matter_id))], docIds: docs.map((d) => d.id), label: docs.map((d) => d.title).join("; ") };
  if (matter) return { matterIds: [matter.id], docIds: null, label: `all papers in ${matter.title}` };
  return { matterIds, docIds: null, label: "all your matters" };
}
