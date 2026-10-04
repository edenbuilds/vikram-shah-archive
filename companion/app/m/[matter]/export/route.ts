import { NextResponse } from "next/server";
import { fileUrls, getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import { pieceUrls } from "@/lib/pdf-file";

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
  const signedPdfs = await fileUrls(supabase, m, list.map((d) => d.pdf_path ?? ""));
  // over 50 MB a PDF is stored in pieces (lib/pdf-file.ts), which the browser fetches and joins
  const urls: (string | string[])[] = await Promise.all(list.map(async (d, i) => signedPdfs[i] || (d.pdf_path ? pieceUrls(supabase, d.pdf_path) : "")));
  const stage = new Map(m.stages.map((s, i) => [s.id, { n: i, title: s.title }]));
  // the files exactly as uploaded
  const { data: objs } = await supabase.storage.from("companion").list(`${m.id}/originals`, { limit: 1000 });
  const origNames = (objs ?? []).map((o) => o.name).filter((n) => !only || n.replace(/\.part\d{3}$/, "") === only).sort();
  const { data: signed } = origNames.length
    ? await supabase.storage.from("companion").createSignedUrls(origNames.map((n) => `${m.id}/originals/${n}`), 1800)
    : { data: [] };
  return NextResponse.json({
    matter: m.title,
    // a big original sits in pieces (name.part000, ...): one entry, its pieces' URLs in order
    originals: Object.entries(origNames.reduce<Record<string, string[]>>((acc, n, i) => {
      const url = signed?.[i]?.signedUrl; if (url) (acc[n.replace(/\.part\d{3}$/, "")] ??= []).push(url); return acc;
    }, {})).map(([name, urls]) => ({ name, url: urls.length === 1 ? urls[0] : urls })),
    papers: list.map((d, i) => ({
      id: d.id, title: d.title, stage: stage.get(d.stage)?.title ?? d.stage, stageOrder: stage.get(d.stage)?.n ?? 99, order: i + 1,
      pages: d.page_count, source: d.source_path, filename: d.filename, sha256: d.sha256, pdf: urls[i] || null,
      md: `/m/${m.id}/d/${d.id}/download/md`, docx: `/m/${m.id}/d/${d.id}/download/docx`,
    })),
  });
}
