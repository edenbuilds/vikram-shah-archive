import Link from "next/link";
import { ask } from "@/app/actions";
import Submit from "@/app/Submit";
import type { VerifiedClaim } from "@/lib/citations";
import { pages } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

type Msg = {
  id: string; role: "user" | "assistant"; content: string; status: string | null; model: string | null;
  citations: VerifiedClaim[];
  retrieved: { chunks?: { id: number; doc_id: string; page_start: number; page_end: number; similarity: number }[]; rejected?: { text: string; reason: string }[]; gate?: string | null };
};

const STARTERS = [
  "Who are the parties, as named in the papers?",
  "What reliefs are claimed?",
  "What orders have been passed so far?",
  "What does the notice of arbitration demand?",
  "Which papers mention the joint venture agreement?",
];

export default async function Ask({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ t?: string; q?: string }> }) {
  const { matter } = await params;
  const { t, q } = await searchParams;
  const { supabase } = await requireUser();
  const { data: threads } = await supabase.from("qa_threads").select("id, title, matter_id, created_at")
    .or(`matter_id.eq.${matter},matter_id.is.null`).order("created_at", { ascending: false }).limit(30);
  const thread = (threads ?? []).find((x) => x.id === t);
  const { data: msgs } = thread
    ? await supabase.from("qa_messages").select("*").eq("thread_id", thread.id).order("created_at")
    : { data: [] as Msg[] };
  const docIds = [...new Set((msgs as Msg[]).flatMap((m) => [...m.citations.flatMap((c) => c.citations.map((x) => x.doc_id)), ...(m.retrieved.chunks ?? []).map((c) => c.doc_id)]))];
  const { data: docs } = docIds.length ? await supabase.from("documents").select("id, title, matter_id").in("id", docIds) : { data: [] };
  const doc = new Map((docs ?? []).map((d) => [d.id, d]));
  const href = (id: string, p: number) => `/m/${doc.get(id)?.matter_id ?? matter}/d/${id}?p=${p}`;

  return (
    <div className="layout">
      <div className="stack" style={{ gap: "1.1rem" }}>
        {!thread ? (
          <div className="empty" style={{ textAlign: "left" }}>
            <p className="kicker">Ask the papers</p>
            <h3>Questions answered only from what&apos;s on file</h3>
            <p style={{ margin: "0 0 1rem" }}>
              Every statement comes pinned to a paper, a page and a word-for-word quote you can click through. If the papers don&apos;t say it, you&apos;ll be told so; nothing is filled in from general knowledge. An editorial assist, not advice.
            </p>
            <div className="chips">
              {STARTERS.map((s) => <Link key={s} className="chip" href={`?q=${encodeURIComponent(s)}`}>{s}</Link>)}
            </div>
          </div>
        ) : (
          <div className="thread">
            {(msgs as Msg[]).map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="q">{m.content}</div>
              ) : m.status === "answered" ? (
                <section key={m.id} className="assist">
                  <p className="assist-label">From the papers · every line pinned</p>
                  {m.citations.map((c, i) => (
                    <div key={i} className="claim">
                      {c.text}
                      {c.citations.map((p, j) => (
                        <Link key={j} className="pin" href={href(p.doc_id, p.page_start)}>
                          &ldquo;{p.quote}&rdquo;
                          <cite>{doc.get(p.doc_id)?.title ?? p.doc_id}, {pages(p.page_start, p.page_end)} →</cite>
                        </Link>
                      ))}
                    </div>
                  ))}
                  <Audit m={m} title={(id) => doc.get(id)?.title ?? id} />
                </section>
              ) : (
                <section key={m.id} className="refusal">
                  <b>Not found in the papers on file.</b> The passages retrieved don&apos;t state this, so there&apos;s no answer rather than a guess.
                  <Audit m={m} title={(id) => doc.get(id)?.title ?? id} />
                </section>
              ),
            )}
          </div>
        )}

        <form action={ask} className={`card stack${thread ? " composer" : ""}`}>
          <input type="hidden" name="matter" value={matter} />
          {thread && <input type="hidden" name="thread" value={thread.id} />}
          <textarea name="question" rows={3} required defaultValue={q ?? ""} autoFocus={!!q}
            placeholder={thread ? "Ask a follow-up…" : "Ask anything about the papers on file…"} aria-label="Question" />
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            {!thread ? (
              <div className="row" style={{ alignItems: "center", flex: "1 1 auto", gap: "1rem" }}>
                <label style={{ display: "flex", gap: ".4rem", fontWeight: 400, flex: "0 0 auto", alignItems: "center" }}><input type="radio" name="scope" value="matter" defaultChecked /> This matter</label>
                <label style={{ display: "flex", gap: ".4rem", fontWeight: 400, flex: "0 0 auto", alignItems: "center" }}><input type="radio" name="scope" value="all" /> All my matters</label>
              </div>
            ) : <span className="subtle" style={{ flex: "1 1 auto" }}>Follow-ups search the same scope.</span>}
            <div style={{ flex: "0 0 auto" }}><Submit pending="Reading the papers…">Ask</Submit></div>
          </div>
        </form>
      </div>

      <aside className="side">
        <div className="card">
          <h3>Threads</h3>
          <p style={{ margin: "0 0 .6rem" }}><Link className="btn ghost small" href={`/m/${matter}/ask`}>＋ New thread</Link></p>
          {!threads?.length && <p className="subtle" style={{ margin: 0 }}>Your questions are kept here, with an audit of what the model was shown.</p>}
          <ul className="plain">
            {(threads ?? []).map((x) => (
              <li key={x.id} style={{ padding: ".35rem 0", borderBottom: "1px solid var(--rule)" }}>
                <Link href={`/m/${matter}/ask?t=${x.id}`} style={{ fontWeight: x.id === t ? 700 : 400, textDecoration: "none" }}>{x.title}</Link>
                {!x.matter_id && <span className="pill" style={{ marginLeft: ".3rem" }}>all matters</span>}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Audit({ m, title }: { m: Msg; title: (id: string) => string }) {
  const r = m.retrieved;
  return (
    <details style={{ marginTop: ".7rem" }}>
      <summary className="subtle">Audit: what the model was shown{r.rejected?.length ? ` · ${r.rejected.length} statement(s) withheld` : ""}</summary>
      {r.gate && <p className="subtle">Stopped before the model: {r.gate}</p>}
      <ul className="subtle">{(r.chunks ?? []).map((c) => <li key={c.id}>{title(c.doc_id)}, {pages(c.page_start, c.page_end)} · similarity {c.similarity.toFixed(2)}</li>)}</ul>
      {!!r.rejected?.length && <ul>{r.rejected.map((x, i) => <li key={i} className="subtle">Withheld: &ldquo;{x.text}&rdquo; ({x.reason})</li>)}</ul>}
    </details>
  );
}
