import { fileUrls, getMatter, dmyIST } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import Workspace, { type Doc, type Source } from "./Workspace";
import type { Note } from "../d/[doc]/Transcript";

export const metadata = { title: "Workspace" };

type Section = { title?: string; mark?: string; pageStart?: number; level?: number };

// 12-10-2026: LiquidText-style reading view (Omkar's screenshots): documents | outline on the left,
// the whole paper scrolling as one continuous PDF in the middle, her notes on the right, each tied to its page.
export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ d?: string; p?: string }> }) {
  const { matter } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const [{ data: docs }, { data: jobs }] = await Promise.all([
    supabase.from("documents").select("id, stage, title, filename, source_path, page_count, bytes, ingested_at, sections, pdf_path").eq("matter_id", m.id).order("stage").order("sort"),
    supabase.from("ingest_jobs").select("id, filename, status, doc_id, page_count, created_at").eq("matter_id", m.id).order("created_at", { ascending: false }),
  ]);
  const all = docs ?? [];
  if (!all.length) return <p className="muted">No papers in this matter yet. Add them under Upload.</p>;
  const d = all.find((x) => x.id === sp.d) ?? all[0];

  const [{ data: pages }, { data: notes }] = await Promise.all([
    supabase.from("document_pages").select("page_no, jpeg_path").eq("doc_id", d.id).order("page_no"),
    supabase.from("annotations").select("id, page_no, char_start, char_end, quote, body, tags, created_at").eq("doc_id", d.id).order("page_no").order("created_at"),
  ]);
  const byNo = new Map((pages ?? []).map((p) => [p.page_no, p.jpeg_path]));
  const paths = Array.from({ length: d.page_count }, (_, i) => byNo.get(i + 1) ?? `pages/${d.id}/page-${String(i + 1).padStart(3, "0")}.jpg`);
  const scans = await fileUrls(supabase, m, paths);
  // missing for papers filed before 13-10-2026 or typed in by hand: those pages just have no text layer
  const words = await fileUrls(supabase, m, paths.map((p) => p.replace(/page-(\d+)\.jpg$/, "words-$1.json")));

  // Every file that came in for this matter: uploads from ingest_jobs, plus papers filed without a job (the archive import).
  const viaJob = new Set((jobs ?? []).map((j) => j.doc_id).filter(Boolean));
  const sources: Source[] = [
    ...(jobs ?? []).map((j) => ({ key: j.id, file: j.filename, when: dmyIST(j.created_at), status: j.status, doc: j.doc_id, pages: j.page_count, how: "Uploaded" })),
    ...all.filter((x) => !viaJob.has(x.id)).map((x) => ({ key: x.id, file: x.source_path || x.filename, when: dmyIST(x.ingested_at), status: "done", doc: x.id, pages: x.page_count, how: "Imported" })),
  ];

  const list: Doc[] = all.map((x) => ({ id: x.id, title: x.title, stage: m.stages.find((s) => s.id === x.stage)?.title ?? x.stage, pages: x.page_count }));
  const outline = ((d.sections ?? []) as Section[]).filter((s) => s.pageStart).map((s) => ({
    title: (s.title ?? "").replace(/^#+\s*/, "").trim() || s.mark || "Opening pages", page: s.pageStart!, level: s.level ?? 0,
  }));
  const src = sources.find((s) => s.doc === d.id);

  return (
    <Workspace key={d.id} matter={m.id} docs={list} doc={{ id: d.id, title: d.title, pages: d.page_count }} scans={scans} words={words}
      outline={outline} notes={(notes ?? []) as Note[]} sources={sources} start={Number(sp.p) || 1}
      origin={src ? `${src.how} as ${src.file} on ${src.when}` : `From ${d.source_path || d.filename}`} />
  );
}
