// One-off Q&A smoke test against the live corpus: npm-less, service role.
//   node --env-file=.env.local --experimental-strip-types scripts/ask-once.ts <matter> "<question>"
import { createClient } from "@supabase/supabase-js";
import { answer } from "../lib/qa.ts";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
console.log(JSON.stringify(await answer(db as never, process.argv[3], [process.argv[2]]), null, 1).slice(0, 2500));
