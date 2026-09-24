import Link from "next/link";
import ExportZip from "./ExportZip";
import { fmtDate, getMatter, pages } from "@/lib/data";
import { getReading } from "@/lib/reading";
import { requireUser } from "@/lib/supabase";
import { getBrief, getDates, getExplainer, newSince } from "@/lib/study";

type Doc = { id: string; title: string; stage: string; page_count: number; kind: string | null };

const EXAMPLES = ["notice of arbitration", "sale deed", "interim reliefs", "jurisdiction", "consent terms"];

export default async function Papers({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ q?: string }> }) {
  const { matter } = await params;
  const { q } = await searchParams;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: docs }, { data: people }, { data: notes }, { data: next }, hits, brief, dates, explainer, reading] = await Promise.all([
    supabase.from("documents").select("id, title, stage, page_count, kind, filename, ingested_at").eq("matter_id", m.id).order("sort"),
    supabase.from("matter_people").select("role, as_printed, person_id").eq("matter_id", m.id),
    supabase.from("annotations").select("id, doc_id, page_no, body, created_at").eq("matter_id", m.id).order("created_at", { ascending: false }),
    supabase.from("hearings").select("id, date, purpose").eq("matter_id", m.id).eq("status", "upcoming").gte("date", today).order("date").limit(1),
    q ? supabase.from("chunks").select("id, doc_id, page_start, page_end, text").eq("matter_id", m.id)
          .textSearch("tsv", q, { type: "websearch", config: "english" }).limit(40) : Promise.resolve({ data: null }),
    getBrief(matter), getDates(matter), getExplainer(matter), getReading(matter),
  ]);
  // new papers since her brief or the dates list were made: ask before remaking them
  const now = { papers: (docs ?? []).length, last: (docs ?? []).reduce((a, d) => (d.ingested_at > a ? d.ingested_at : a), "") };
  const staleBrief = brief ? newSince(brief.basis, now, brief.ack) : 0;
  const staleDates = dates ? newSince(dates.basis, now, dates.ack) : 0;
  const staleEx = explainer ? newSince(explainer.basis, now, explainer.ack) : 0;
  const staleRead = reading ? newSince(reading.basis, now, reading.ack) : 0;
  const stale = [[staleEx, "explainer", "/explainer", "Review the explainer"], [staleRead, "reading order", "/reading", "Review the reading order"], [staleBrief, "hearing brief", "/brief", "Review the brief"], [staleDates, "dates list", "/chronology/papers", "Review the dates"]]
    .filter(([n]) => (n as number) > 0) as [number, string, string, string][];
  const list = (docs ?? []) as Doc[];
  const title = new Map(list.map((d) => [d.id, d.title]));
  const noteCount = (id: string) => (notes ?? []).filter((n) => n.doc_id === id).length;
  const byStage = new Map<string, Doc[]>();
  for (const d of list) byStage.set(d.stage, [...(byStage.get(d.stage) ?? []), d]);
  const known = new Set(m.stages.map((s) => s.id));
  const stages = [...m.stages, ...[...byStage.keys()].filter((k) => !known.has(k)).map((id) => ({ id, title: id, note: undefined }))];
  const filled = stages.filter((s) => byStage.get(s.id)?.length);
  const empty = stages.filter((s) => !byStage.get(s.id)?.length);

  // Cross-matter memory: the same (deduped) person in any other matter this advocate can see.
  const ids = (people ?? []).map((p) => p.person_id);
  const { data: elsewhere } = ids.length
    ? await supabase.from("matter_people").select("person_id, role, matter_id, matters(title)").in("person_id", ids).neq("matter_id", m.id)
    : { data: [] };

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {stale.length > 0 && (
        <div className="ask-first">
          <p><b>New papers on file.</b> Your {stale.map(([, what]) => what).join(stale.length > 2 ? ", " : " and ").replace(/, ([^,]*)$/, " and $1")} {stale.length > 1 ? "were" : "was"} made before {Math.max(...stale.map(([n]) => n)) > 1 ? "they" : "it"} arrived. Update now?</p>
          <div className="row" style={{ gap: ".5rem" }}>
            {stale.map(([, , path, label], i) => <Link key={path} className={`btn${i ? " ghost" : ""}`} href={`/m/${m.id}${path}`}>{label}</Link>)}
          </div>
        </div>
      )}
      <div className="stats">
        <div className="stat"><b>{list.length}</b><span>Papers</span></div>
        <div className="stat"><b>{list.reduce((a, d) => a + d.page_count, 0).toLocaleString("en-IN")}</b><span>Pages</span></div>
        <div className="stat"><b>{notes?.length ?? 0}</b><span>Your notes</span></div>
        <Link className="stat" href={next?.[0] ? `/m/${m.id}/hearings/${next[0].id}` : `/m/${m.id}/hearings`}>
          <b style={{ fontSize: next?.[0] ? "1.15rem" : undefined, paddingTop: next?.[0] ? ".3rem" : undefined }}>{next?.[0] ? fmtDate(next[0].date) : "None set"}</b>
          <span>Next hearing</span>
        </Link>
      </div>

      <form role="search" className="stack" style={{ gap: ".5rem" }}>
        <div className="searchbar">
          <input type="search" name="q" defaultValue={q} placeholder="Search every page of every paper…" aria-label="Search the papers" />
          <button className="btn" style={{ flex: "0 0 auto" }}>Search</button>
        </div>
        {!q && (
          <div className="chips">
            <span className="subtle" style={{ alignSelf: "center" }}>Try</span>
            {EXAMPLES.map((e) => <Link key={e} className="chip" href={`?q=${encodeURIComponent(e)}`}>{e}</Link>)}
          </div>
        )}
      </form>

      {q && (
        <section className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2>{hits.data?.length ?? 0} passage{hits.data?.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;</h2>
            <Link href={`/m/${m.id}`} className="subtle">clear</Link>
          </div>
          {!hits.data?.length && <p className="muted">Nothing on file matches. Try fewer or different words, or ask the papers a question.</p>}
          {(hits.data ?? []).map((h) => (
            <div key={h.id} className="hit">
              <Link href={`/m/${m.id}/d/${h.doc_id}?p=${h.page_start}`}><b>{title.get(h.doc_id)}</b></Link>{" "}
              <span className="pill">{pages(h.page_start, h.page_end)}</span>
              <p>{h.text.slice(0, 340)}{h.text.length > 340 ? "…" : ""}</p>
            </div>
          ))}
        </section>
      )}

      <div className="layout">
        <section>
          {!list.length ? (
            <div className="empty">
              <div className="glyph">¶</div>
              <h3>No papers filed yet</h3>
              <p>Upload this matter&apos;s PDFs. Each is OCR&apos;d page by page and filed under the stage you choose.</p>
              <Link className="btn" href={`/m/${m.id}/upload`}>Upload papers</Link>
            </div>
          ) : (
            <>
              {filled.map((s) => (
                <div key={s.id} className="stage-card">
                  <header>
                    <div><h2>{s.title}</h2>{s.note && <p>{s.note}</p>}</div>
                    <span className="subtle" style={{ whiteSpace: "nowrap" }}>{byStage.get(s.id)!.length} paper{byStage.get(s.id)!.length === 1 ? "" : "s"}</span>
                  </header>
                  {byStage.get(s.id)!.map((d) => (
                    <Link key={d.id} href={`/m/${m.id}/d/${d.id}`} className="docrow">
                      <span className="doc-ico" aria-hidden />
                      <span className="dt">{d.title}</span>
                      <span className="meta">
                        {noteCount(d.id) > 0 && <span className="pill note">{noteCount(d.id)} note{noteCount(d.id) === 1 ? "" : "s"}</span>}
                        {d.kind && <span className="pill">{d.kind}</span>}
                        <span>{d.page_count} pp.</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ))}
              {empty.length > 0 && (
                <p className="empty-stages">Nothing filed yet under {empty.map((s) => s.title.replace(/^\d+\.\s*/, "")).join(" · ")}. <Link href={`/m/${m.id}/upload`}>Upload</Link></p>
              )}
            </>
          )}
        </section>

        <aside className="side">
          {!!docs?.length && (
            <div className="card">
              <h3>Download</h3>
              <ExportZip matter={m.id} files={[...new Set(docs.map((d) => d.filename))].map((name) => ({ name, papers: docs.filter((d) => d.filename === name).length }))
                .filter((f) => f.papers > 1 || docs.length < 60)} />
            </div>
          )}
          {!!notes?.length && (
            <div className="card">
              <h3>Recent notes</h3>
              {notes.slice(0, 5).map((n) => (
                <Link key={n.id} className="recent-note" href={`/m/${m.id}/d/${n.doc_id}${n.page_no ? `?p=${n.page_no}` : ""}`}>
                  {n.body.slice(0, 110)}{n.body.length > 110 ? "…" : ""}
                  <small>{title.get(n.doc_id)?.slice(0, 48)}{n.page_no ? `, p. ${n.page_no}` : ""}</small>
                </Link>
              ))}
            </div>
          )}
          {!!people?.length && (
            <div className="card">
              <h3>People</h3>
              {people.map((p) => (
                <div key={p.person_id + p.role} className="person">
                  {p.as_printed} <span className="pill">{p.role}</span>
                  {(elsewhere ?? []).filter((e) => e.person_id === p.person_id).map((e) => (
                    <div key={e.matter_id + e.role} className="subtle">
                      ↳ also in <Link href={`/m/${e.matter_id}`}>{(e.matters as unknown as { title: string } | null)?.title ?? e.matter_id}</Link>
                    </div>
                  ))}
                </div>
              ))}
              <p className="subtle" style={{ margin: ".6rem 0 0" }}>Matched by name across your matters. A lookup, not an identity finding.</p>
            </div>
          )}
          {m.posture && <div className="card"><h3>Posture</h3><p className="muted" style={{ margin: 0, fontSize: ".9rem" }}>{m.posture}</p></div>}
        </aside>
      </div>
    </div>
  );
}
