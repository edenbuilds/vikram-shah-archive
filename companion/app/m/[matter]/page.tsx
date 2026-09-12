import Link from "next/link";
import { getMatter, pages } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

type Doc = { id: string; title: string; stage: string; page_count: number; kind: string | null; ocr_source: string | null };

export default async function Papers({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ q?: string }> }) {
  const { matter } = await params;
  const { q } = await searchParams;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);

  const [{ data: docs }, { data: people }, hits] = await Promise.all([
    supabase.from("documents").select("id, title, stage, page_count, kind, ocr_source").eq("matter_id", m.id).order("sort"),
    supabase.from("matter_people").select("role, as_printed, person_id").eq("matter_id", m.id),
    q ? supabase.from("chunks").select("id, doc_id, page_start, page_end, text").eq("matter_id", m.id)
          .textSearch("tsv", q, { type: "websearch", config: "english" }).limit(40) : Promise.resolve({ data: null }),
  ]);
  const byStage = new Map<string, Doc[]>();
  for (const d of (docs ?? []) as Doc[]) byStage.set(d.stage, [...(byStage.get(d.stage) ?? []), d]);
  const title = new Map((docs ?? []).map((d) => [d.id, d.title]));

  // Cross-matter memory: the same (deduped) person in any other matter this advocate can see.
  const ids = (people ?? []).map((p) => p.person_id);
  const { data: elsewhere } = ids.length
    ? await supabase.from("matter_people").select("person_id, role, matter_id, matters(title)").in("person_id", ids).neq("matter_id", m.id)
    : { data: [] };

  const known = new Set(m.stages.map((s) => s.id));
  const stages = [...m.stages, ...[...byStage.keys()].filter((k) => !known.has(k)).map((id) => ({ id, title: id, note: undefined }))];

  return (
    <div className="stack">
      <form className="row" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Search every page of every paper (e.g. 3.676, sale deed, s.17 reliefs)" style={{ flex: "4 1 20rem" }} />
        <button className="btn" style={{ flex: "0 0 auto" }}>Search</button>
      </form>

      {q && (
        <section className="card">
          <h2>{hits.data?.length ?? 0} passages for &ldquo;{q}&rdquo;</h2>
          {(hits.data ?? []).map((h) => (
            <div key={h.id} className="hit">
              <Link href={`/m/${m.id}/d/${h.doc_id}?p=${h.page_start}`}><b>{title.get(h.doc_id)}</b></Link>{" "}
              <span className="pill">{pages(h.page_start, h.page_end)}</span>
              <p>{h.text.slice(0, 360)}{h.text.length > 360 ? "…" : ""}</p>
            </div>
          ))}
        </section>
      )}

      <div className="reader" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(16rem, 22rem)" }}>
        <section>
          <h2>Filing tree</h2>
          {stages.map((s) => {
            const list = byStage.get(s.id) ?? [];
            return (
              <div key={s.id} className="stage">
                <h2><span>{s.title}</span><small className="subtle">{list.length} papers</small></h2>
                {s.note && <p className="subtle" style={{ marginTop: 0 }}>{s.note}</p>}
                <ul className="plain doclist">
                  {list.map((d) => (
                    <li key={d.id}>
                      <Link href={`/m/${m.id}/d/${d.id}`}>{d.title}</Link>
                      <span className="subtle" style={{ whiteSpace: "nowrap" }}>{d.page_count} pp.</span>
                    </li>
                  ))}
                  {!list.length && <li className="subtle">Nothing filed here yet.</li>}
                </ul>
              </div>
            );
          })}
        </section>
        <aside className="rail">
          <div className="card">
            <h3>People in this matter</h3>
            <ul className="plain">
              {(people ?? []).map((p) => (
                <li key={p.person_id + p.role}>
                  {p.as_printed} <span className="pill">{p.role}</span>
                  {(elsewhere ?? []).filter((e) => e.person_id === p.person_id).map((e) => (
                    <div key={e.matter_id + e.role} className="subtle">
                      also {e.role} in <Link href={`/m/${e.matter_id}`}>{(e.matters as unknown as { title: string } | null)?.title ?? e.matter_id}</Link>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
            <p className="subtle">Matching is by normalised name across your matters. It retrieves records; it does not infer identity.</p>
          </div>
          {m.posture && <div className="card"><h3>Posture</h3><p className="muted" style={{ margin: 0 }}>{m.posture}</p></div>}
        </aside>
      </div>
    </div>
  );
}
