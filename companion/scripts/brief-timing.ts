// Time the three brief sections the way /api/study runs them (in parallel).
//   node --env-file=.env.local --experimental-strip-types scripts/brief-timing.ts <matter>
import { createClient } from "@supabase/supabase-js";
import { runAgent } from "../lib/agent.ts";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const Q = {
  listed: "What does the latest notice or order in the papers list this matter for next, on what date, and what applications or issues are pending decision? Quote the notice, order or application.",
  stands: "What is each party's stand in this matter? For each party, state its case and the relief it seeks, from that party's own pleading, reply or application, attributed to that paper.",
  orders: "List the orders passed in this matter so far, in date order, each with its date and what it directs, quoting the order.",
};
const t0 = Date.now();
await Promise.all(Object.entries(Q).map(async ([k, q]) => {
  try {
    const r = await runAgent(db as never, q, { matterIds: [process.argv[2]], docIds: null }, [], () => {});
    console.log(k, `${((Date.now() - t0) / 1000).toFixed(0)}s`, r.status, r.claims.length, "claims", r.rejected.length, "withheld", r.steps.length, "steps");
  } catch (e) { console.log(k, "ERROR", (e as Error).message.slice(0, 300)); }
}));
