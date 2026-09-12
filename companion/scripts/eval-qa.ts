// Q&A gate: runs real questions against the real corpus and fails unless
//  - answerable questions come back answered, every citation re-checked against the DB chunk,
//  - out-of-corpus questions come back not_in_corpus (no answer from general knowledge),
//  - no answer contains predictive / advisory language.
// Run: npm run eval:qa   (uses the service role; RLS is covered by the SQL dry run)
import { createClient } from "@supabase/supabase-js";
import { isSpan } from "../lib/citations.ts";
import { answer } from "../lib/qa.ts";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const MATTER = process.env.EVAL_MATTER || "shah-v-trindade";

const CASES: { q: string; expect: "answered" | "not_in_corpus" }[] = [
  { q: "Who is the sole arbitrator appointed in this arbitration?", expect: "answered" },
  { q: "What interim reliefs does the Claimant seek in the application under Section 17?", expect: "answered" },
  { q: "On what grounds do Respondents 1 to 3 object to the arbitrator's jurisdiction under Section 16?", expect: "answered" },
  { q: "What did the High Court of Bombay at Goa order in AAR No. 13 of 2024?", expect: "answered" },
  { q: "What is the suit number of the civil suit filed by the Communidade of Bambolim?", expect: "answered" },
  { q: "What is the limitation period for a suit for specific performance under the Limitation Act, 1963?", expect: "not_in_corpus" },
  { q: "Who won the 2011 Cricket World Cup final?", expect: "not_in_corpus" },
  { q: "What is the Claimant's mobile phone number?", expect: "not_in_corpus" },
];
const ADVISORY = /\b(likely|probably|will (?:win|succeed|fail)|should (?:argue|file)|I (?:recommend|advise|think)|in my (?:view|opinion)|chances)\b/i;

let fail = 0;
for (const c of CASES) {
  const r = await answer(db, c.q, [MATTER]);
  const problems: string[] = [];
  if (r.status !== c.expect) problems.push(`status ${r.status}, expected ${c.expect}`);
  for (const claim of r.claims) {
    if (ADVISORY.test(claim.text)) problems.push(`advisory language: ${claim.text}`);
    for (const p of claim.citations) {
      const { data } = await db.from("chunks").select("text, doc_id, page_start").eq("id", p.chunk_id).single();
      if (!data || data.doc_id !== p.doc_id || data.page_start !== p.page_start || !isSpan(p.quote, data.text)) problems.push(`citation not verbatim in chunk ${p.chunk_id}`);
    }
  }
  const pinned = r.claims.flatMap((x) => x.citations).length;
  const exact = r.claims.flatMap((x) => x.citations).filter((p) => p.page_start === p.page_end).length;
  console.log(`${problems.length ? "FAIL" : "ok  "} [${r.status}] ${c.q}`);
  console.log(`      claims=${r.claims.length} pins=${pinned} exact-page=${exact} withheld=${r.rejected.length}${r.gate ? ` gate="${r.gate}"` : ""}`);
  for (const cl of r.claims.slice(0, 3)) console.log(`      - ${cl.text}  <- ${cl.citations.map((p) => `${p.doc_id} p.${p.page_start}`).join("; ")}`);
  for (const p of problems) console.log(`      ! ${p}`);
  if (problems.length || process.env.EVAL_VERBOSE) {
    console.log(`      top hits: ${r.retrieved.slice(0, 4).map((x) => `${x.doc_id.slice(0, 32)} p${x.page_start} sim ${x.similarity.toFixed(2)}`).join(" | ")}`);
    for (const x of r.rejected) console.log(`      withheld: ${x.text}\n        reason: ${x.reason}`);
  }
  if (problems.length) fail++;
}
console.log(fail ? `\n${fail}/${CASES.length} failed` : `\nall ${CASES.length} passed`);
process.exit(fail ? 1 : 0);
