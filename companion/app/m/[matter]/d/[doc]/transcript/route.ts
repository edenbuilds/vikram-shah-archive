import { requireUser } from "@/lib/supabase";

// The verbatim transcript as a Markdown download. RLS decides access, as everywhere else.
export async function GET(_: Request, { params }: { params: Promise<{ matter: string; doc: string }> }) {
  const { matter, doc } = await params;
  const { supabase } = await requireUser();
  const { data: d } = await supabase.from("documents").select("id, title, transcript").eq("id", doc).eq("matter_id", matter).maybeSingle();
  if (!d) return new Response("Not found", { status: 404 });
  return new Response(`# ${d.title}\n\n${d.transcript ?? ""}`, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${d.id}.md"` },
  });
}
