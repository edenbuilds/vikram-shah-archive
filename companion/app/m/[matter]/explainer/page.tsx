import Link from "next/link";
import RunStudy from "@/components/RunStudy";
import Tools from "@/app/pins/Tools";
import ShareMenu from "@/components/ShareMenu";
import { admin } from "@/lib/access";
import { dmyIST, fileUrls, getMatter } from "@/lib/data";
import { pageLabel, printedFor } from "@/lib/printed";
import SectionNote from "@/components/SectionNote";
import { spelledDifferently } from "@/lib/spelling";
import { basisOf, getExplainer, getSectionNotes, madeBy, newSince, yoursPath } from "@/lib/study";
import { requireUser } from "@/lib/supabase";

// The matter explained in plain English, in five parts, each sentence footnoted to the page it
// comes from. Made on request from the papers, and remade only when she says so.
export async function generateMetadata({ params }: { params: Promise<{ matter: string }> }) {
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, (await params).matter);
  return { title: `Explainer, ${m.short ?? m.title}` };
}

export default async function Explainer({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const [ex, now, printed, { data: docs }, yours, mine] = await Promise.all([
    getExplainer(matter), basisOf(supabase, matter), printedFor(supabase, matter),
    supabase.from("documents").select("id, title, pdf_path").eq("matter_id", matter),
    admin().storage.from("companion").createSignedUrl(yoursPath(matter), 3600).then((r) => r.data?.signedUrl ?? null),
    getSectionNotes(matter, "explainer"),
  ]);
  const title = new Map((docs ?? []).map((d) => [d.id, d.title]));
  const fresh = ex ? newSince(ex.basis, now, ex.ack) : 0;
  // 04-10-2026: Omkar: "everything should be clickable... navigates to that part in pdf as well": each number and sentence
  // opens the paper at its page, and each footnote also opens the PDF itself at that page.
  const cited = [...new Set((ex?.sections ?? []).flatMap((s) => s.claims.flatMap((c) => c.citations.map((p) => p.doc_id))))];
  const pdfPath = new Map((docs ?? []).map((d) => [d.id, d.pdf_path as string | null]));
  const pdfs = await fileUrls(supabase, m, cited.map((id) => pdfPath.get(id) ?? ""));
  const pdfOf = new Map(cited.map((id, i) => [id, pdfs[i]]));

  // one running footnote number across the parts, as in a printed explainer
  let n = 0;
  const parts = (ex?.sections ?? []).map((s, i) => ({
    ...s, part: i + 1,
    asFiled: spelledDifferently(s.claims.flatMap((c) => [c.text, ...c.citations.map((p) => p.quote)]).join(" "), m.title),
    lines: s.claims.map((c) => ({
      text: c.text,
      cells: s.key === "table" ? c.text.split(/\s*\|\s*/) : [],
      notes: c.citations.map((p) => ({ n: ++n, pdf: pdfOf.get(p.doc_id) || "", doc: p.doc_id, page: p.page_start, quote: p.quote.replace(/\s+/g, " ").trim(), where: `${title.get(p.doc_id) ?? p.doc_id}, ${pageLabel(p.page_start, printed[p.doc_id]?.[p.page_start])}` })),
    })),
  }));
  const at = (x: { doc: string; page: number }) => `/m/${matter}/d/${x.doc}?p=${x.page}`;
  const heads = ["Proceeding", "What it does", "Who filed or passed it", "Date", "Outcome"];
  const md = ex ? [`# ${m.title}`, "Plain English explainer", [m.forum, m.cause].filter(Boolean).join(", "), "",
    ...parts.flatMap((s) => [`## Part ${s.part}: ${s.title}`, "",
      ...(s.status !== "answered" ? ["Not found in the papers on file.", ""]
        : s.key === "table" ? [`| ${heads.join(" | ")} | Source |`, `|${" --- |".repeat(heads.length + 1)}`, ...s.lines.map((l) => `| ${[...l.cells, ...heads.map(() => "")].slice(0, heads.length).join(" | ")} | ${l.notes.map((x) => `[${x.n}]`).join("")} |`), ""]
        : [s.lines.map((l) => `${l.text}${l.notes.map((x) => `[${x.n}]`).join("")}`).join(" "), ""]),
      ...s.lines.flatMap((l) => l.notes.map((x) => `[${x.n}] "${x.quote}" (${x.where})`)), ""]),
    `Made ${dmyIST(ex.made_at)} from ${ex.basis.papers} papers. Every sentence is from the papers; nothing is added.`].join("\n") : "";

  return (
    <div className="stack explainer">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <div style={{ flex: "1 1 16rem" }}>
          <h2 style={{ marginBottom: ".2rem" }}>Plain English explainer</h2>
          <p className="muted" style={{ margin: 0 }}>The case in five parts, every sentence with its page.{yours && <> <a href={yours} target="_blank" rel="noreferrer">Your explainer (PDF)</a></>}</p>
        </div>
        {ex && <div className="row" style={{ gap: ".5rem" }}><Tools text={md} md={md} name={`${m.id} explainer`} copyLabel="Copy explainer" /><ShareMenu title={`Explainer, ${m.short ?? m.title}`} /></div>}
      </div>

      {!ex && (
        <div className="empty">
          <h3>What this case is, told simply</h3>
          <p>What kind of case it is, the ladder of authorities, the papers in the file, the story in date order and a summary table, read from the papers in this matter. Takes two or three minutes.</p>
          <RunStudy matter={matter} kind="explainer" label="Make the explainer" />
        </div>
      )}

      {ex && fresh > 0 && (
        <div className="ask-first">
          <p><b>{fresh} new paper{fresh > 1 ? "s" : ""}</b> {fresh > 1 ? "were" : "was"} added since this explainer was made on {dmyIST(ex.made_at)}. Update it to include {fresh > 1 ? "them" : "it"}?</p>
          <div className="row" style={{ gap: ".5rem" }}>
            <RunStudy matter={matter} kind="explainer" label="Update the explainer" />
            <RunStudy matter={matter} kind="keep-explainer" label="Keep this one" ghost />
          </div>
        </div>
      )}

      {parts.map((s) => (
        <section key={s.key} className="card brief-section">
          <h3><span className="subtle">Part {s.part}</span> {s.title}</h3>
          {s.status !== "answered" ? <p className="muted" style={{ margin: 0 }}>Not found in the papers on file.</p>
            : s.key === "table" ? (
              <div className="table-wrap">
                <table>
                  <thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{s.lines.map((l, i) => (
                    <tr key={i}>{heads.map((_, k) => <td key={k}>{k === 0 && l.notes[0] ? <Link className="cite-line" href={at(l.notes[0])}>{l.cells[k] ?? ""}</Link> : l.cells[k] ?? ""}{k === heads.length - 1 && l.notes.map((x) => <sup key={x.n}><Link href={at(x)} title={`Open ${x.where}`}>{x.n}</Link></sup>)}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <p className="prose">{s.lines.map((l, i) => (
                <span key={i}>{l.notes[0] ? <Link className="cite-line" href={at(l.notes[0])} title={`Open ${l.notes[0].where}`}>{l.text}</Link> : l.text}{l.notes.map((x) => <sup key={x.n}><Link href={at(x)} id={`ref-${x.n}`} title={`Open ${x.where}`}>{x.n}</Link></sup>)}{" "}</span>
              ))}</p>
            )}
          {s.status === "answered" && (
            <ol className="footnotes">
              {s.lines.flatMap((l) => l.notes).map((x) => (
                <li key={x.n} id={`fn-${x.n}`} value={x.n}>
                  <Link href={at(x)}><q>{x.quote}</q> <cite>{x.where}</cite></Link>
                  {x.pdf && <> <a className="fn-pdf" href={`${x.pdf}#page=${x.page}`} target="_blank" rel="noreferrer">PDF p. {x.page}</a></>}
                </li>
              ))}
            </ol>
          )}
          {s.status === "answered" && s.asFiled.map(([as, listed]) => <p key={as} className="subtle" style={{ margin: ".4rem 0 0" }}>The paper spells this &ldquo;{as}&rdquo;; your matter lists &ldquo;{listed}&rdquo;. Shown as filed.</p>)}
          {!!s.rejected.length && <p className="subtle" style={{ margin: ".4rem 0 0" }}>{s.rejected.length} line(s) withheld: no verbatim receipt.</p>}
          <SectionNote matter={matter} kind="explainer" sectionKey={s.key} initial={mine[s.key] ?? ""} />
        </section>
      ))}

      {ex && !fresh && (
        <div className="row subtle" style={{ alignItems: "center", gap: ".8rem" }}>
          <span>Made {dmyIST(ex.made_at)}{madeBy(ex.by)} from {ex.basis.papers} papers. Every sentence is from the papers; nothing is added.</span>
          <RunStudy matter={matter} kind="explainer" label="Make it again" ghost />
        </div>
      )}
    </div>
  );
}
