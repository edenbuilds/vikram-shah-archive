// CC-80741E: rebuild table pages (an index read cell by cell) row by row from the word positions, through correctPage so
// every page keeps its first read and can be put back from the reader. node --env-file=.env.local --experimental-strip-types scripts/table-pages.ts <doc id> ...
import { createClient } from "@supabase/supabase-js";
import { correctPage } from "../lib/corrections.ts";
import { looksLikeTable, tableText, type Word } from "../lib/layout.ts";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
for (const id of process.argv.slice(2)) {
  const { data: d } = await db.from("documents").select("id, matter_id").eq("id", id).single();
  const { data: pages } = await db.from("document_pages").select("page_no, jpeg_path").eq("doc_id", id).order("page_no");
  for (const p of pages ?? []) {
    const { data: f } = await db.storage.from("companion").download(p.jpeg_path.replace(/page-(\d+)\.jpg$/, "words-$1.json"));
    const words = f ? (JSON.parse(await f.text()) as Word[]) : [];
    const table = words.length > 0 && looksLikeTable(words);
    const r = table ? await correctPage(db as never, d!, p.page_no, tableText(words), { by: "Case Companion", reason: "Table rows rebuilt from where each word sits on the scan (CC-80741E)", via: "ai" }) : "not a table";
    console.log(id, p.page_no, words.length ? r : "no word positions");
  }
}
