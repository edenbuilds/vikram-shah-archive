import Link from "next/link";
import type { VerifiedClaim } from "@/lib/citations";
import { fileUrls, getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import AskBox from "./AskBox";

export const metadata = { title: "Ask · Case Companion" };

type Msg = {
  id: string; role: "user" | "assistant"; content: string; status: string | null; model: string | null; citations: VerifiedClaim[];
  retrieved: { sources?: string[] | null; steps?: { kind: string; text: string }[]; pages?: unknown[]; rejected?: { text: string; reason: string }[];
    chunks?: { doc_id: string }[]; gate?: string | null };
};

const STARTERS = [
  "When is the next hearing, and what is it for?",
  "Who are the parties, as named in the papers?",
  "What reliefs are sought, and by whom?",
  "What orders have been passed so far?",
  "Why is the appeal being withdrawn?",
];

export default async function AskPage({ searchParams }: { searchParams: Promise<{ t?: string; m?: string; src?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: matters }, { data: papers }, { data: threads }, { data: cols }] = await Promise.all([
    supabase.from("matters").select("id, title, stages").order("created_at"),
    supabase.from("documents").select("id, title, stage, page_count, matter_id").order("sort"),
    supabase.from("qa_threads").select("id, title, matter_id, created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("collections").select("id, title, matter_id, collection_items(doc_id)").order("created_at"),
  ]);
  const notebooks = (cols ?? []).map((c) => ({ id: c.id, title: c.title, matter_id: c.matter_id, docs: [...new Set((c.collection_items as { doc_id: string }[]).map((i) => i.doc_id))] })).filter((c) => c.docs.length);
  const thread = (threads ?? []).find((x) => x.id === sp.t);
  const { data: msgData } = thread ? await supabase.from("qa_messages").select("*").eq("thread_id", thread.id).order("created_at") : { data: [] };
  const msgs = (msgData ?? []) as Msg[];
  const sources = msgs[0]?.retrieved?.sources ?? null;
  const title = (id: string) => papers?.find((p) => p.id === id)?.title ?? id;
  const matterOf = (id: string) => papers?.find((p) => p.id === id)?.matter_id ?? "";

  // page scan for every receipt, signed per matter
  const cites = msgs.flatMap((m) => (m.citations ?? []).flatMap((c) => c.citations));
  const keys = [...new Set(cites.map((c) => `${c.doc_id}#${c.page_start}`))];
  const thumbs = new Map<string, string>();
  if (keys.length) {
    const { data: pgs } = await supabase.from("document_pages").select("doc_id, page_no, jpeg_path").in("doc_id", [...new Set(cites.map((c) => c.doc_id))]).in("page_no", [...new Set(cites.map((c) => c.page_start))]);
    for (const mid of [...new Set(keys.map((k) => matterOf(k.split("#")[0])))].filter(Boolean)) {
      const m = await getMatter(supabase, mid);
      const rows = (pgs ?? []).filter((p) => matterOf(p.doc_id) === mid && keys.includes(`${p.doc_id}#${p.page_no}`));
      const urls = await fileUrls(supabase, m, rows.map((r) => r.jpeg_path));
      rows.forEach((r, i) => thumbs.set(`${r.doc_id}#${r.page_no}`, urls[i]));
    }
  }
  const scopeLabel = thread
    ? `${thread.matter_id ? (matters ?? []).find((m) => m.id === thread.matter_id)?.title : "All my matters"}${sources?.length ? ` · ${sources.length} chosen paper${sources.length === 1 ? "" : "s"}` : ""}`
    : "";

  return (
    <main className="wrap layout" style={{ paddingTop: "1.25rem" }}>
      <div className="stack" style={{ gap: "1.1rem", minWidth: 0 }}>
        {!thread ? (
          <div>
            <h1 style={{ marginBottom: ".35rem" }}>Ask</h1>
            <p className="muted" style={{ margin: 0 }}>Every line of the answer comes with its receipt: the exact words, the paper, the page and its scan. If the papers don&apos;t say it, you&apos;ll be told so.</p>
          </div>
        ) : (
          <div>
            <p className="subtle" style={{ margin: 0 }}>{scopeLabel}</p>
            {!!sources?.length && <div className="chips" style={{ marginTop: ".4rem" }}>{sources.map((s) => <Link key={s} className="chip" href={`/m/${matterOf(s)}/d/${s}`}>{title(s)}</Link>)}</div>}
          </div>
        )}

        {!thread && (
          <div className="chips" style={{ order: 3 }}>
            <span className="subtle" style={{ alignSelf: "center" }}>Try:</span>
            {STARTERS.map((s) => <Link key={s} className="chip" href={`/ask?${new URLSearchParams({ ...(sp.m ? { m: sp.m } : {}), ...(sp.src ? { src: sp.src } : {}), q: s })}`}>{s}</Link>)}
          </div>
        )}

        {thread && (
          <div className="thread">
            {msgs.map((m) => m.role === "user" ? <div key={m.id} className="q">{m.content}</div> : (
              <section key={m.id} className={m.status === "answered" ? "assist" : "refusal"}>
                {m.status === "answered" ? (
                  <>
                    <p className="assist-label">From the papers · each line has its receipt</p>
                    {m.citations.map((c, i) => (
                      <div key={i} className="claim">
                        <p style={{ margin: "0 0 .5rem" }}>{c.text}</p>
                        {c.citations.map((p, j) => {
                          const href = `/m/${matterOf(p.doc_id)}/d/${p.doc_id}?p=${p.page_start}`;
                          const img = thumbs.get(`${p.doc_id}#${p.page_start}`);
                          return (
                            <Link key={j} href={href} className="receipt">
                              {img ? <img src={img} alt={`Scan of ${title(p.doc_id)}, page ${p.page_start}`} loading="lazy" /> : <span className="noimg" />}
                              <span>
                                <q>{p.quote.replace(/\s+/g, " ")}</q>
                                <cite>{title(p.doc_id)}, p. {p.page_start} →</cite>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </>
                ) : <p style={{ margin: 0 }}><b>Not found in the papers on file.</b> Nothing in the sources says this, so there&apos;s no answer rather than a guess.</p>}
                <details style={{ marginTop: ".7rem" }}>
                  <summary className="subtle">How this was answered{m.retrieved.rejected?.length ? ` · ${m.retrieved.rejected.length} line(s) withheld` : ""}</summary>
                  <ol className="agent-steps">{(m.retrieved.steps ?? []).map((s, i) => <li key={i}>{s.text}</li>)}</ol>
                  {!!m.retrieved.rejected?.length && <ul>{m.retrieved.rejected.map((x, i) => <li key={i} className="subtle">Withheld (no verbatim receipt): &ldquo;{x.text}&rdquo;</li>)}</ul>}
                  {m.model && <p className="subtle" style={{ margin: ".3rem 0 0" }}>Model: {m.model}. Quotes checked in code against the page text.</p>}
                </details>
              </section>
            ))}
          </div>
        )}

        <AskBox key={thread?.id ?? `${sp.m}-${sp.src}-${sp.q}`} matters={(matters ?? []) as never} papers={(papers ?? []) as never} notebooks={notebooks}
          initialMatter={thread?.matter_id ?? sp.m ?? ""} initialSources={sp.src ? sp.src.split(",") : []}
          initialQuestion={thread ? "" : sp.q ?? ""} thread={thread?.id} locked={thread ? `Follow-ups use the same sources: ${scopeLabel}.` : undefined} />
      </div>

      <aside className="side">
        <div className="card">
          <h3>Threads</h3>
          <p style={{ margin: "0 0 .6rem" }}><Link className="btn ghost small" href="/ask">＋ New question</Link></p>
          <ul className="plain">
            {(threads ?? []).map((x) => (
              <li key={x.id} style={{ padding: ".35rem 0", borderBottom: "1px solid var(--rule)" }}>
                <Link href={`/ask?t=${x.id}`} style={{ fontWeight: x.id === sp.t ? 700 : 400, textDecoration: "none" }}>{x.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
