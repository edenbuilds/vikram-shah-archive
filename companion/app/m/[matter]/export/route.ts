import { NextResponse } from "next/server";
import { fileUrls, getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

// Manifest for "Download everything": where each paper's stored PDF is (signed for 30 min) and
// where its transcript comes from. The browser fetches and zips, so size is never capped by a
// serverless response. ?file=<upload filename> limits it to the papers split from one file.
export async function GET(req: Request, { params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const only = new URL(req.url).searchParams.get("file");
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  let q = supabase.from("documents").select("id, title, stage, page_count, source_path, filename, pdf_path, sha256").eq("matter_id", m.id).order("sort");
  if (only) q = q.eq("filename", only);
  const { data: docs } = await q;
  const list = docs ?? [];
  const urls = await fileUrls(supabase, m, list.map((d) => d.pdf_path ?? ""));
  const stage = new Map(m.stages.map((s, i) => [s.id, { n: i, title: s.title }]));
  // the files exactly as uploaded
  const { data: objs } = await supabase.storage.from("companion").list(`${m.id}/originals`, { limit: 1000 });
  const origNames = (objs ?? []).map((o) => o.name).filter((n) => !only || n === only);
  const { data: signed } = origNames.length
    ? await supabase.storage.from("companion").createSignedUrls(origNames.map((n) => `${m.id}/originals/${n}`), 1800)
    : { data: [] };
  return NextResponse.json({
    matter: m.title,
    originals: origNames.map((name, i) => ({ name, url: signed?.[i]?.signedUrl ?? null })).filter((o) => o.url),
    papers: list.map((d, i) => ({
      id: d.id, title: d.title, stage: stage.get(d.stage)?.title ?? d.stage, stageOrder: stage.get(d.stage)?.n ?? 99, order: i + 1,
      pages: d.page_count, source: d.source_path, filename: d.filename, sha256: d.sha256, pdf: urls[i] || null,
      md: `/m/${m.id}/d/${d.id}/download/md`, docx: `/m/${m.id}/d/${d.id}/download/docx`,
    })),
  });
}
