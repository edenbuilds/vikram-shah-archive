// Does the bot pick the papers she means?  node --env-file=.env.local --experimental-strip-types scripts/scope-test.ts
import { createClient } from "@supabase/supabase-js";
import { resolveScope } from "../lib/scope.ts";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const all = ((await db.from("matter_members").select("matter_id").eq("email", "aryap1116@gmail.com")).data ?? []).map((r) => r.matter_id);
const cases: [string, RegExp, string][] = [
  ["In the Shetty withdrawal application, why is the appeal being withdrawn?", /withdrawal/i, "shetty-v-oberoi"],
  ["patil writ exhibit K - what did the high court order say", /Exhibit K/i, "lade-v-state-wp-1575-2026"],
  ["guruprasad: what does the reply of respondent 1 say about covid delays?", /Affidavit in reply/i, "mandrawadkar-v-oberoi"],
  ["When is the next hearing in the Lade writ petition?", /^all papers in/i, "lade-v-state-wp-1575-2026"],
  ["what's the status of everything", /all your matters/i, ""],
];
let pass = 0;
for (const [msg, want, matter] of cases) {
  const r = await resolveScope(db as never, msg, "", all);
  const ok = want.test(r.label) && (!matter || r.matterIds.includes(matter));
  pass += ok ? 1 : 0;
  console.log(`${ok ? "PASS" : "FAIL"} "${msg}"\n     -> ${r.label.slice(0, 150)} [${r.docIds?.length ?? "all"} papers]`);
}
console.log(`${pass}/${cases.length}`);
