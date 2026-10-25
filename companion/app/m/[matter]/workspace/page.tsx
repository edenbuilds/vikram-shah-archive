import { getMatter, dmyIST } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import { docBundle } from "@/lib/workspace";
import Workspace, { type Doc, type Source } from "./Workspace";

export const metadata = { title: "Workspace" };

// 12-10-2026: LiquidText-style reading view (Omkar's screenshots): documents | outline on the left,
// the whole paper scrolling as one continuous PDF in the middle, her notes on the right, each tied to its page.
export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ d?: string; p?: string }> }) {
  const { matter } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const [{ data: docs }, { data: jobs }] = await Promise.all([
    supabase.from("documents").select("id, stage, title, filename, source_path, page_count, bytes, ingested_at, sections, pdf_path").eq("matter_id", m.id).order("stage").order("sort").order("id"),
    supabase.from("ingest_jobs").select("id, filename, status, doc_id, page_count, created_at").eq("matter_id", m.id).order("created_at", { ascending: false }),
  ]);
  // stage order as the matter lists its stages, then her order within a stage (moveDocOrder)
  const at = (st: string) => { const i = m.stages.findIndex((s) => s.id === st); return i < 0 ? m.stages.length : i; };
  const all = (docs ?? []).sort((a, b) => at(a.stage) - at(b.stage));
  if (!all.length) return <p className="muted">No papers read in this matter yet. Add them under Upload; files from Arya Files wait there until you choose Read.</p>;
  const d = all.find((x) => x.id === sp.d) ?? all[0];
  const first = (await docBundle(supabase, m, d.id))!;

  // Every file that came in for this matter: uploads from ingest_jobs, plus papers filed without a job (the archive import).
  const viaJob = new Set((jobs ?? []).map((j) => j.doc_id).filter(Boolean));
  const sources: Source[] = [
    ...(jobs ?? []).map((j) => ({ key: j.id, file: j.filename, when: dmyIST(j.created_at), status: j.status, doc: j.doc_id, pages: j.page_count, how: "Uploaded" })),
    ...all.filter((x) => !viaJob.has(x.id)).map((x) => ({ key: x.id, file: x.source_path || x.filename, when: dmyIST(x.ingested_at), status: "done", doc: x.id, pages: x.page_count, how: "Imported" })),
  ];
  const list: Doc[] = all.map((x) => {
    const src = sources.find((s) => s.doc === x.id);
    return {
      id: x.id, title: x.title, file: x.filename || x.source_path || x.title, from: Number(/pp\. (\d+)/.exec(x.source_path ?? "")?.[1]) || 0, stage: m.stages.find((s) => s.id === x.stage)?.title ?? x.stage, pages: x.page_count, added: x.ingested_at ?? "",
      origin: src ? `${src.how} as ${src.file} on ${src.when}` : `From ${x.source_path || x.filename}`,
    };
  });

  return <Workspace matter={m.id} docs={list} first={{ id: d.id, ...first }} sources={sources} start={Number(sp.p) || 1} />;
}
