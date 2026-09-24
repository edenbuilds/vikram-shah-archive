import Link from "next/link";
import RunStudy from "@/components/RunStudy";
import Tools from "@/app/pins/Tools";
import { admin } from "@/lib/access";
import { dmyIST, getMatter } from "@/lib/data";
import { pageLabel, printedFor } from "@/lib/printed";
import { basisOf, getExplainer, newSince, yoursPath } from "@/lib/study";
import { requireUser } from "@/lib/supabase";

// The matter explained in plain English, in five parts, each sentence footnoted to the page it
// comes from. Made on request from the papers, and remade only when she says so.
export default async function Explainer({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const [ex, now, printed, { data: docs }, yours] = await Promise.all([
    getExplainer(matter), basisOf(supabase, matter), printedFor(supabase, matter),
    supabase.from("documents").select("id, title").eq("matter_id", matter),
    admin().storage.from("companion").createSignedUrl(yoursPath(matter), 3600).then((r) => r.data?.signedUrl ?? null),
  ]);
  const title = new Map((docs ?? []).map((d) => [d.id, d.title]));
  const fresh = ex ? newSince(ex.basis, now, ex.ack) : 0;

  // one running footnote number across the parts, as in a printed explainer
  let n = 0;
  const parts = (ex?.sections ?? []).map((s, i) => ({
    ...s, part: i + 1,
    lines: s.claims.map((c) => ({
      text: c.text,
      cells: s.key === "table" ? c.text.split(/\s*\|\s*/) : [],
      notes: c.citations.map((p) => ({ n: ++n, doc: p.doc_id, page: p.page_start, quote: p.quote.replace(/\s+/g, " ").trim(), where: `${title.get(p.doc_id) ?? p.doc_id}, ${pageLabel(p.page_start, printed[p.doc_id]?.[p.page_start])}` })),
    })),
  }));
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
        <div>
          <h2 style={{ marginBottom: ".2rem" }}>Plain English explainer</h2>
          <p className="muted" style={{ margin: 0 }}>The case in five parts, every sentence with its page.{yours && <> <a href={yours} target="_blank" rel="noreferrer">Your explainer (PDF)</a></>}</p>
        </div>
        {ex && <Tools text={md} md={md} name={`${m.id} explainer`} copyLabel="Copy explainer" />}
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
                    <tr key={i}>{heads.map((_, k) => <td key={k}>{l.cells[k] ?? ""}{k === heads.length - 1 && l.notes.map((x) => <sup key={x.n}><a href={`#fn-${x.n}`}>{x.n}</a></sup>)}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <p className="prose">{s.lines.map((l, i) => (
                <span key={i}>{l.text}{l.notes.map((x) => <sup key={x.n}><a href={`#fn-${x.n}`} id={`ref-${x.n}`}>{x.n}</a></sup>)}{" "}</span>
              ))}</p>
            )}
          {s.status === "answered" && (
            <ol className="footnotes">
              {s.lines.flatMap((l) => l.notes).map((x) => (
                <li key={x.n} id={`fn-${x.n}`} value={x.n}>
                  <Link href={`/m/${matter}/d/${x.doc}?p=${x.page}`}><q>{x.quote}</q> <cite>{x.where}</cite></Link>
                </li>
              ))}
            </ol>
          )}
          {!!s.rejected.length && <p className="subtle" style={{ margin: ".4rem 0 0" }}>{s.rejected.length} line(s) withheld: no verbatim receipt.</p>}
        </section>
      ))}

      {ex && !fresh && (
        <div className="row subtle" style={{ alignItems: "center", gap: ".8rem" }}>
          <span>Made {dmyIST(ex.made_at)} from {ex.basis.papers} papers. Every sentence is from the papers; nothing is added.</span>
          <RunStudy matter={matter} kind="explainer" label="Make it again" ghost />
        </div>
      )}
    </div>
  );
}
