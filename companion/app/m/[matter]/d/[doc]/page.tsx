import Link from "next/link";
import { notFound } from "next/navigation";
import { fileUrls, getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import { toBlocks } from "@/lib/transcript";
import Reader, { type Note } from "./Transcript";

export default async function DocPage({ params, searchParams }: { params: Promise<{ matter: string; doc: string }>; searchParams: Promise<{ p?: string }> }) {
  const { matter, doc } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const { data: d } = await supabase.from("documents").select("*").eq("id", doc).eq("matter_id", m.id).maybeSingle();
  if (!d) notFound();
  const p = Math.min(Math.max(1, Number(sp.p) || 1), d.page_count);

  const [{ data: pg }, { data: notes }, { data: cols }] = await Promise.all([
    supabase.from("document_pages").select("page_no, jpeg_path, text_source").eq("doc_id", d.id).eq("page_no", p).maybeSingle(),
    supabase.from("annotations").select("id, page_no, char_start, char_end, quote, body, tags, created_at").eq("doc_id", d.id).order("created_at"),
    supabase.from("collections").select("id, title").eq("matter_id", m.id).order("created_at"),
  ]);
  const [scan, pdf] = await fileUrls(supabase, m, [pg?.jpeg_path ?? `pages/${d.id}/page-${String(p).padStart(3, "0")}.jpg`, d.pdf_path ?? ""]);
  const stage = m.stages.find((s) => s.id === d.stage);
  const blocks = toBlocks(d.transcript ?? "");
  const pageKeyed = blocks.some((b) => b.kind === "page");

  return (
    <div className="stack" style={{ gap: "1.1rem" }}>
      <div className="doc-head">
        <div style={{ minWidth: 0, flex: "1 1 32rem" }}>
          <p className="crumbs" style={{ margin: "0 0 .35rem" }}><Link href={`/m/${m.id}`}>Papers</Link> / {stage?.title ?? d.stage}</p>
          <h1 style={{ fontSize: "clamp(1.25rem, 2.4vw, 1.6rem)", margin: 0 }}>{d.title}</h1>
          <div className="doc-facts">
            <span className="pill">{d.page_count} pages</span>
            {d.kind && <span className="pill">{d.kind}</span>}
            <span className="pill">OCR: {d.ocr_source ?? "n/a"}</span>
            {(notes?.length ?? 0) > 0 && <span className="pill note">{notes!.length} note{notes!.length === 1 ? "" : "s"}</span>}
            {!pageKeyed && <span className="pill warn">Continuous OCR: page breaks follow the scans</span>}
          </div>
        </div>
        <div className="row" style={{ flex: "0 0 auto", gap: ".5rem" }}>
          {pdf && <a className="btn ghost small" href={pdf} target="_blank" rel="noreferrer">Original PDF ↗</a>}
          <Link className="btn ghost small" href={`/m/${m.id}/ask`}>Ask about this matter</Link>
        </div>
      </div>

      <Reader
        matter={m.id} doc={d.id} pageCount={d.page_count} currentPage={p} jump={sp.p !== undefined}
        blocks={blocks} notes={(notes ?? []) as Note[]} scan={scan} textSource={pg?.text_source ?? null}
        collections={cols ?? []}
      />
      <details className="subtle"><summary className="subtle">File details</summary>
        <p className="mono" style={{ marginTop: ".5rem" }}>{d.filename} · SHA-256 {d.sha256}</p>
      </details>
    </div>
  );
}
