// Agent checks on live data: node --env-file=.env.local --experimental-strip-types scripts/agent-test.ts
import { createClient } from "@supabase/supabase-js";
import { runAgent } from "../lib/agent.ts";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const id = async (mid: string, like: string) => (await db.from("documents").select("id").eq("matter_id", mid).ilike("title", like).limit(1).single()).data!.id as string;
const cases: [string, string, string[] | null, string, "answered" | "not_in_corpus"][] = [
  ["whole matter", "lade-v-state-wp-1575-2026", null, "On what date and time is the notice returnable, and before which bench?", "answered"],
  ["one chosen paper", "shetty-v-oberoi", [await id("shetty-v-oberoi", "Application seeking withdrawal%")], "Why is the appeal being withdrawn?", "answered"],
  ["receipts for every figure", "shetty-v-oberoi", [await id("shetty-v-oberoi", "Application seeking withdrawal%")], "Why is the appeal being withdrawn, and what exactly does the prayer ask for?", "answered"],
  ["answer outside chosen paper", "shetty-v-oberoi", [await id("shetty-v-oberoi", "Vakalatnama in the appeal")], "What is the date of the impugned order?", "not_in_corpus"],
  ["not in papers", "lade-v-state-wp-1575-2026", null, "What is Respondent No. 9's mobile phone number?", "not_in_corpus"],
];
let pass = 0;
for (const [label, mid, docs, q, want] of cases) {
  const t0 = Date.now();
  const r = await runAgent(db as never, q, { matterIds: [mid], docIds: docs }, [], () => {});
  const ok = r.status === want && (want === "not_in_corpus" || r.claims.every((c) => c.citations.length > 0));
  if (docs) for (const c of r.claims) for (const x of c.citations) if (!docs.includes(x.doc_id)) console.log("   !! cited outside chosen sources:", x.doc_id);
  pass += ok ? 1 : 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} (${((Date.now() - t0) / 1000).toFixed(0)}s, ${r.steps.length} steps): ${r.status}`);
  for (const c of r.claims) console.log(`   • ${c.text.slice(0, 160)}\n     receipt: "${c.citations[0]?.quote.replace(/\s+/g, " ").slice(0, 110)}" [${c.citations[0]?.doc_id.slice(0, 40)} p.${c.citations[0]?.page_start}]`);
  if (r.rejected.length) console.log(`   withheld ${r.rejected.length}: ${r.rejected.map((x) => x.reason.slice(0, 80)).join(" | ")}`);
}
console.log(`\n${pass}/${cases.length} passed`);
