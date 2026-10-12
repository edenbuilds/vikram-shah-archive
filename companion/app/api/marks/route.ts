import { see } from "@/lib/ai";
import { cleanMarks, MARK_KINDS, type PageMarks } from "@/lib/marks";
import { saveMarks } from "@/lib/marks-store";
import { db } from "@/lib/supabase";
import { track } from "@/lib/activity";

export const maxDuration = 120;

// CC-62B3E4: the stamps, seals, signatures and handwriting on one page, read from its scan by a model when she asks
// (app/m/[matter]/d/[doc]/Marks.tsx). Stored apart from the filed text and her notes; the model can be wrong.
export async function POST(req: Request) {
  const { matter, doc, page } = await req.json().catch(() => ({}));
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first" }, { status: 401 });
  // her own client: row-level security decides whether she may see this paper
  const { data: pg } = await supabase.from("document_pages").select("jpeg_path, documents!inner(matter_id)").eq("doc_id", String(doc)).eq("page_no", Number(page)).eq("documents.matter_id", String(matter)).maybeSingle();
  if (!pg?.jpeg_path) return Response.json({ error: "That page has no scan on file." }, { status: 404 });
  const { data: jpg } = await supabase.storage.from("companion").download(pg.jpeg_path);
  if (!jpg) return Response.json({ error: "The scan of this page could not be opened." }, { status: 404 });
  try {
    const raw = await see(Buffer.from(await jpg.arrayBuffer()).toString("base64"), "jpeg",
      `You list the marks on one scanned page of a court paper: stamps, seals, signatures, initials, handwriting and struck-through text. Reply with only a JSON object {"marks": [{"kind": one of ${MARK_KINDS.join(", ")}, "what": what it is, e.g. "Notary seal, round", "text": the words on it exactly as they appear, or null if none can be read, "where": where on the page, e.g. "bottom right"}]}. List only what is on the page; do not guess unreadable words. If there are none, reply {"marks": []}.`,
      "List the marks on this page.");
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const entry: PageMarks = { at: new Date().toISOString(), by: auth.user.email ?? "", model: "kimi-k3", marks: cleanMarks(JSON.parse(json || "{}")) };
    await saveMarks(String(doc), Number(page), entry);
    await track(auth.user.email, { matter: String(matter), text: `Listed the marks on p. ${page}`, link: `/m/${matter}/d/${doc}?p=${page}` });
    return Response.json(entry);
  } catch (e) {
    return Response.json({ error: `The page could not be read just now: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
