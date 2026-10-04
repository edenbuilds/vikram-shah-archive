// Live check of page corrections on the test matter only: node --env-file=.env.local --experimental-strip-types scripts/correct-check.ts
import { createClient } from "@supabase/supabase-js";
import { correctPage, getHistory } from "../lib/corrections.ts";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: d } = await db.from("documents").select("id, matter_id, transcript").eq("matter_id", "zz-upload-test").like("transcript", "%## Page 1 of%").limit(1).single();
const page = async () => (await db.from("document_pages").select("text, text_source").eq("doc_id", d!.id).eq("page_no", 1).single()).data!;
const before = await page();
const fixed = `${(before.text ?? "").trim()}\n\nCorrection check line 04-10-2026, safe to ignore.`;
console.log("save:", await correctPage(db as never, d!, 1, fixed, { by: "check@case-companion", reason: "live check", via: "web" }));
const after = await page();
const { data: ch } = await db.from("chunks").select("text").eq("doc_id", d!.id).eq("page_start", 1).eq("page_end", 1);
const { data: t } = await db.from("documents").select("transcript").eq("id", d!.id).single();
console.log("page text updated:", after.text === fixed, "| source:", after.text_source, "| chunk has it:", ch!.some((c) => c.text.includes("Correction check line")), "| transcript has it:", t!.transcript.includes("Correction check line"));
const h = (await getHistory(d!.id))[1];
console.log("revert:", await correctPage(db as never, d!, 1, h.original, { by: "check@case-companion", reason: "live check", via: "revert" }));
const back = await page();
const { data: t2 } = await db.from("documents").select("transcript").eq("id", d!.id).single();
console.log("restored:", back.text === before.text, "| source restored:", back.text_source === before.text_source, "| transcript clean:", !t2!.transcript.includes("Correction check line"), "| versions kept:", (await getHistory(d!.id))[1].versions.length);
