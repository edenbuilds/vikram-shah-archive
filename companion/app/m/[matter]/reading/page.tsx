import Link from "next/link";
import RunStudy from "@/components/RunStudy";
import Tools from "@/app/pins/Tools";
import { dmy, dmyIST, getMatter } from "@/lib/data";
import { pageLabel, printedFor } from "@/lib/printed";
import { getReading, readingMarkdown, TIERS, type Field } from "@/lib/reading";
import { basisOf, newSince } from "@/lib/study";
import { requireUser } from "@/lib/supabase";

// Every paper in the order of its own date, grouped by year, with what it is, what it says and
// what it sets up, each with its page; then the papers the record mentions that are not on file.
// Arya's reading-order-chronological-md skill, kept to receipts.
export default async function Reading({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const [r, now, printed] = await Promise.all([getReading(matter), basisOf(supabase, matter), printedFor(supabase, matter)]);
  const fresh = r ? newSince(r.basis, now, r.ack) : 0;
  const titles = new Map((r?.entries ?? []).map((e) => [e.doc, e.title]));
  const label = (doc: string, page: number) => `${doc ? `${titles.get(doc) ?? doc}, ` : ""}${pageLabel(page, printed[doc]?.[page])}`;
  const md = r ? readingMarkdown(r, m.title, [m.forum, m.cause].filter(Boolean).join(", "), label) : "";
  const years: [string, NonNullable<typeof r>["entries"]][] = [];
  for (const e of r?.entries ?? []) {
    const y = e.iso?.slice(0, 4) ?? "Undated";
    if (years.at(-1)?.[0] !== y) years.push([y, []]);
    years.at(-1)![1].push(e);
  }
  const line = (name: string, f: Field, doc: string) => (
    <p style={{ margin: ".25rem 0" }}><b>{name}:</b>{" "}
      {f ? <>{f.text} <Link href={`/m/${matter}/d/${doc}?p=${f.page}`} className="subtle"><q>{f.quote.replace(/\s+/g, " ").trim()}</q> {pageLabel(f.page, printed[doc]?.[f.page])}</Link></>
        : <span className="muted">Not found in the papers on file.</span>}
    </p>
  );

  return (
    <div className="stack explainer">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <h2 style={{ marginBottom: ".2rem" }}>Reading order</h2>
          <p className="muted" style={{ margin: 0 }}>Every paper by its own date, oldest first, and what the papers mention that is not on file.</p>
        </div>
        {r && !r.left && <Tools text={md} md={md} name={`Chronological Reading Order - ${m.short ?? m.title}`} copyLabel="Copy reading order" />}
      </div>

      {!r && (
        <div className="empty">
          <h3>Read the file in date order</h3>
          <p>Each paper is read once: its date, what it is, what it says and what it sets up, each with its page. Takes a few minutes for a large matter.</p>
          <RunStudy matter={matter} kind="reading" label="Make the reading order" />
        </div>
      )}
      {r && r.left > 0 && (
        <div className="ask-first">
          <p><b>{r.left} {r.left === 1 ? "paper is" : "papers are"} still to be read.</b> Continue from where it stopped?</p>
          <RunStudy matter={matter} kind="reading" label="Continue" />
        </div>
      )}
      {r && !r.left && fresh > 0 && (
        <div className="ask-first">
          <p><b>{fresh} new paper{fresh > 1 ? "s" : ""}</b> since {dmyIST(r.made_at)}. Only the new {fresh > 1 ? "ones are" : "one is"} read.</p>
          <div className="row" style={{ gap: ".5rem" }}>
            <RunStudy matter={matter} kind="reading" label="Add them" />
            <RunStudy matter={matter} kind="keep-reading" label="Keep this one" ghost />
          </div>
        </div>
      )}

      {years.map(([y, es]) => (
        <section key={y} className="stack" style={{ gap: ".6rem" }}>
          <h3 style={{ margin: 0 }}>{y}</h3>
          {es.map((e) => (
            <article key={e.doc} className="card brief-section">
              <h4 style={{ margin: 0 }}>{e.iso && <span className="subtle">{dmy(e.iso)} </span>}<Link href={`/m/${matter}/d/${e.doc}`}>{e.title}</Link></h4>
              {line("What it is", e.what, e.doc)}
              {line("What it says", e.says, e.doc)}
              {e.sets && line("What it sets up", e.sets, e.doc)}
              <p className="subtle" style={{ margin: ".25rem 0 0" }}>Read it: {e.importance}</p>
            </article>
          ))}
        </section>
      ))}

      {r && !r.left && (
        <section className="card brief-section">
          <h3>Mentioned in the papers, not on file</h3>
          {!r.needed.length ? <p className="muted" style={{ margin: 0 }}>None found.</p> : TIERS.map((t) => {
            const xs = r.needed.filter((n) => n.tier === t);
            return xs.length ? (
              <div key={t}>
                <h4 style={{ margin: ".6rem 0 .2rem" }}>{t}</h4>
                <ul style={{ margin: 0 }}>{xs.map((n, i) => (
                  <li key={i}>{n.item}. <Link href={`/m/${matter}/d/${n.doc}?p=${n.page}`} className="subtle"><q>{n.quote.replace(/\s+/g, " ").trim()}</q> {label(n.doc, n.page)}</Link></li>
                ))}</ul>
              </div>
            ) : null;
          })}
        </section>
      )}

      {r && !r.left && !fresh && (
        <div className="row subtle" style={{ alignItems: "center", gap: ".8rem" }}>
          <span>Made {dmyIST(r.made_at)} from {r.entries.length} papers. Every line is from the papers; &quot;What it sets up&quot; is only what the paper itself directs.</span>
          <RunStudy matter={matter} kind="reading-all" label="Read all again" ghost />
        </div>
      )}
    </div>
  );
}
