import Link from "next/link";
import { notFound } from "next/navigation";
import { addToCollection } from "@/app/actions";
import { fileUrls, getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import { toBlocks } from "@/lib/transcript";
import Transcript, { type Note } from "./Transcript";

export default async function DocPage({ params, searchParams }: { params: Promise<{ matter: string; doc: string }>; searchParams: Promise<{ p?: string }> }) {
  const { matter, doc } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const { data: d } = await supabase.from("documents").select("*").eq("id", doc).eq("matter_id", m.id).maybeSingle();
  if (!d) notFound();
  const p = Math.min(Math.max(1, Number((await searchParams).p) || 1), d.page_count);

  const [{ data: pg }, { data: notes }, { data: cols }] = await Promise.all([
    supabase.from("document_pages").select("page_no, jpeg_path, text_source").eq("doc_id", d.id).eq("page_no", p).maybeSingle(),
    supabase.from("annotations").select("id, page_no, char_start, char_end, quote, body, tags, created_at").eq("doc_id", d.id).order("created_at"),
    supabase.from("collections").select("id, title").eq("matter_id", m.id).order("created_at"),
  ]);
  const [scan, pdf] = await fileUrls(supabase, m, [pg?.jpeg_path ?? `pages/${d.id}/page-${String(p).padStart(3, "0")}.jpg`, d.pdf_path ?? ""]);
  const stage = m.stages.find((s) => s.id === d.stage);
  const blocks = toBlocks(d.transcript ?? "");
  const pageKeyed = blocks.some((b) => b.kind === "page");
  const href = (n: number) => `/m/${m.id}/d/${d.id}?p=${n}`;

  return (
    <div className="stack">
      <nav className="subtle"><Link href={`/m/${m.id}`}>Papers</Link> / {stage?.title ?? d.stage}</nav>
      <div>
        <h1>{d.title}</h1>
        <p className="subtle" style={{ margin: 0 }}>
          {d.page_count} pages · OCR: {d.ocr_source ?? "n/a"} · {d.filename}
          {pdf && <> · <a href={pdf} target="_blank" rel="noreferrer">Original PDF</a></>}
        </p>
        <p className="mono subtle">SHA-256 {d.sha256}</p>
        {!pageKeyed && <p className="pill warn">Continuous OCR: page boundaries follow the original scans, not this transcript.</p>}
      </div>

      <div className="reader">
        <Transcript
          matter={m.id} doc={d.id} currentPage={p} blocks={blocks}
          notes={(notes ?? []) as Note[]}
        />
        <aside className="rail">
          <div className="card scan">
            <h3>Original scan, page {p} of {d.page_count}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scan} alt={`Scan of page ${p}`} loading="lazy" />
            <nav>
              {p > 1 ? <Link className="btn ghost small" href={href(p - 1)}>← p. {p - 1}</Link> : <span />}
              <span className="subtle">text: {pg?.text_source ?? "scan only"}</span>
              {p < d.page_count ? <Link className="btn ghost small" href={href(p + 1)}>p. {p + 1} →</Link> : <span />}
            </nav>
          </div>
          <form action={addToCollection} className="card stack">
            <h3>Add to a collection</h3>
            <input type="hidden" name="matter" value={m.id} />
            <input type="hidden" name="doc" value={d.id} />
            <input type="hidden" name="page" value={p} />
            <select name="collection" defaultValue="">
              <option value="">New collection…</option>
              {(cols ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <input type="text" name="new_title" placeholder='New collection title, e.g. "Disputed figures"' />
            <input type="text" name="note" placeholder={`Why (optional), pinned to p. ${p}`} />
            <button className="btn ghost small">Add this paper</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
