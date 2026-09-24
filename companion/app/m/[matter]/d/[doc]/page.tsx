import EditDialog from "@/components/EditDialog";
import { renameDocument } from "@/app/actions";
import Link from "next/link";
import { printedNumbers } from "@/lib/printed";
import { notFound } from "next/navigation";
import { fileUrls, getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import { toBlocks } from "@/lib/transcript";
import { facts } from "@/lib/facts";

type Section = { numeral?: string; title?: string; mark?: string; pages?: string; pageStart?: number };
const cleanTitle = (s: Section) => {
  const t = (s.title ?? "").trim();
  return !t || t.startsWith(">") || t.startsWith("<!--") ? (s.mark && s.mark !== "—" ? s.mark : "Opening pages") : t.replace(/^#+\s*/, "");
};
import Reader, { type Note } from "./Transcript";

export default async function DocPage({ params, searchParams }: { params: Promise<{ matter: string; doc: string }>; searchParams: Promise<{ p?: string; pg?: string }> }) {
  const { matter, doc } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const { data: d } = await supabase.from("documents").select("*").eq("id", doc).eq("matter_id", m.id).maybeSingle();
  if (!d) notFound();
  const { data: texts } = await supabase.from("document_pages").select("page_no, text").eq("doc_id", d.id).order("page_no");
  // ?pg= opens a page by the number printed on it (what an index or a draft cites); ?p= is the PDF page
  const numbers = printedNumbers(texts ?? []);
  const byPrinted = sp.pg ? Number(Object.entries(numbers).find(([, n]) => n === Number(sp.pg))?.[0]) : 0;
  const p = Math.min(Math.max(1, byPrinted || Number(sp.p) || 1), d.page_count);

  const [{ data: pg }, { data: notes }, { data: cols }] = await Promise.all([
    supabase.from("document_pages").select("page_no, jpeg_path, text_source").eq("doc_id", d.id).eq("page_no", p).maybeSingle(),
    supabase.from("annotations").select("id, page_no, char_start, char_end, quote, body, tags, created_at").eq("doc_id", d.id).order("created_at"),
    supabase.from("collections").select("id, title").eq("matter_id", m.id).order("created_at"),
  ]);
  const sections = ((d.sections ?? []) as Section[]).filter((s) => s.pageStart);
  const printed = facts(texts ?? []);
  const kinds = [["date", "Dates"], ["amount", "Amounts"], ["ref", "Case numbers"]] as const;
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
          <EditDialog action={renameDocument} hidden={{ doc: d.id }} label="Rename" fields={[{ name: "title", label: "Title", value: d.title }]} />
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
          <Link className="btn ghost small" href={`/ask?m=${m.id}&src=${d.id}`}>Ask about this paper</Link>
        </div>
      </div>

      <div className="glance">
        <section className="card">
          <h3>Contents</h3>
          {d.source_path && d.source_path !== d.filename && <p className="subtle" style={{ margin: "0 0 .6rem" }}>From {d.source_path}</p>}
          <ol className="contents">
            {(sections.length ? sections : [{ numeral: "I", title: d.title, pages: `1-${d.page_count}`, pageStart: 1 }]).map((s, i) => (
              <li key={i}>
                <Link href={`/m/${m.id}/d/${d.id}?p=${s.pageStart}`}>
                  <span className="num">{s.numeral ?? i + 1}</span>
                  <span className="t">{cleanTitle(s)}</span>
                  <span className="pp">{s.pages?.includes("-") ? `pp. ${s.pages}` : `p. ${s.pages}`}</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="row" style={{ marginTop: ".8rem", gap: ".5rem", alignItems: "center" }}>
            <span className="subtle" style={{ flex: "0 0 auto" }}>Download</span>
            {(["pdf", "docx", "md", "txt"] as const).map((f) => (
              <a key={f} className="btn ghost small" style={{ flex: "0 0 auto" }} href={`/m/${m.id}/d/${d.id}/download/${f}`}>
                {{ pdf: "PDF", docx: "Word", md: "Markdown", txt: "Text" }[f]}
              </a>
            ))}
          </div>
        </section>
        {printed.length > 0 && (
          <section className="card">
            <h3>As printed on this paper</h3>
            <p className="subtle" style={{ margin: "0 0 .6rem" }}>Copied from the text, not checked or interpreted. Click a page to see it.</p>
            {kinds.map(([k, label]) => {
              const xs = printed.filter((f) => f.kind === k);
              return xs.length ? (
                <details key={k} open={k === "date"} className="printed">
                  <summary>{label} <span className="subtle">{xs.length}</span></summary>
                  <ul className="plain">
                    {xs.map((f) => (
                      <li key={f.text}><span>{f.text}</span>
                        <span className="pp">{f.pages.slice(0, 6).map((n) => <Link key={n} href={`/m/${m.id}/d/${d.id}?p=${n}`}>p. {n}</Link>)}{f.pages.length > 6 ? ` +${f.pages.length - 6}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null;
            })}
          </section>
        )}
      </div>

      <Reader
        matter={m.id} doc={d.id} pageCount={d.page_count} currentPage={p} jump={sp.p !== undefined || !!byPrinted} printed={numbers}
        blocks={blocks} notes={(notes ?? []) as Note[]} scan={scan} textSource={pg?.text_source ?? null}
        collections={cols ?? []}
      />
      <details className="subtle"><summary className="subtle">File details</summary>
        <p className="mono" style={{ marginTop: ".5rem" }}>{d.filename} · SHA-256 {d.sha256}</p>
      </details>
    </div>
  );
}
