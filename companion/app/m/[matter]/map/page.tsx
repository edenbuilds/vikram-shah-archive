import Link from "next/link";
import { getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

type Section = { numeral?: string; title?: string; mark?: string; pages?: string; pageStart?: number };

// The case as a tree: who is who, then every stage, paper and section, down to the page.
export default async function MapPage({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const [{ data: docs }, { data: people }] = await Promise.all([
    supabase.from("documents").select("id, title, stage, page_count, sections, source_path").eq("matter_id", m.id).order("sort"),
    supabase.from("matter_people").select("role, as_printed").eq("matter_id", m.id),
  ]);
  const roles = [...new Set((people ?? []).map((p) => p.role))];
  const filled = m.stages.map((s) => ({ s, ds: (docs ?? []).filter((d) => d.stage === s.id) })).filter((x) => x.ds.length);

  return (
    <div className="stack">
      <div>
        <h2>Case map</h2>
        <p className="muted" style={{ margin: 0 }}>Parties as named on the papers, then every stage, paper and section. Open a branch; click a line to read it.</p>
      </div>
      <ul className="tree">
        <li>
          <details open>
            <summary><b>{m.title}</b>{m.cause ? <span className="subtle"> · {m.cause}</span> : null}</summary>
            <ul>
              {!!roles.length && (
                <li>
                  <details>
                    <summary>Parties and counsel <span className="subtle">{people!.length}</span></summary>
                    <ul>
                      {roles.map((r) => (
                        <li key={r}><span className="subtle">{r}:</span> {(people ?? []).filter((p) => p.role === r).map((p) => p.as_printed).join("; ")}</li>
                      ))}
                    </ul>
                  </details>
                </li>
              )}
              {filled.map(({ s, ds }) => (
                <li key={s.id}>
                  <details open={filled.length <= 3}>
                    <summary>{s.title} <span className="subtle">{ds.length} papers · {ds.reduce((a, d) => a + d.page_count, 0)} pp.</span></summary>
                    <ul>
                      {ds.map((d) => {
                        const secs = ((d.sections ?? []) as Section[]).filter((x) => x.pageStart);
                        const leaf = <Link href={`/m/${m.id}/d/${d.id}`}>{d.title}</Link>;
                        return (
                          <li key={d.id}>
                            {secs.length > 1 ? (
                              <details>
                                <summary>{leaf} <span className="subtle">{d.page_count} pp. · {secs.length} sections</span></summary>
                                <ul>
                                  {secs.map((x, i) => (
                                    <li key={i}><Link href={`/m/${m.id}/d/${d.id}?p=${x.pageStart}`}>{x.numeral} {x.mark && x.mark !== "—" ? x.mark : (x.title ?? "").replace(/^[#>]+\s*/, "").slice(0, 80)}</Link> <span className="subtle">p. {x.pages}</span></li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <>{leaf} <span className="subtle">{d.page_count} pp.</span></>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        </li>
      </ul>
    </div>
  );
}
