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

export default async function Ask({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ t?: string }> }) {
  const { matter } = await params;
  const { t } = await searchParams;
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
    <div className="reader">
      <div className="stack">
        <div>
          <h2>Ask the papers</h2>
          <p className="muted">Answers come only from the papers on file, each statement pinned to a paper, page and verbatim quote. If the papers don&apos;t say it, you&apos;ll be told so. This is an editorial assist, not advice or a finding.</p>
        </div>

        {(msgs as Msg[]).map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="q">Q. {m.content}</p>
          ) : m.status === "answered" ? (
            <section key={m.id} className="assist">
              <p className="assist-label">Editorial assist · source-pinned · {m.model}</p>
              {m.citations.map((c, i) => (
                <div key={i} className="claim">
                  {c.text}
                  {c.citations.map((p, j) => (
                    <Link key={j} className="pin" href={href(p.doc_id, p.page_start)}>
                      &ldquo;{p.quote}&rdquo;
                      <cite>{doc.get(p.doc_id)?.title ?? p.doc_id}, {pages(p.page_start, p.page_end)}</cite>
                    </Link>
                  ))}
                </div>
              ))}
              <Audit m={m} title={(id) => doc.get(id)?.title ?? id} />
            </section>
          ) : (
            <section key={m.id} className="refusal">
              <b>Not found in the papers on file.</b> The retrieved passages don&apos;t state this, so there is no answer. Nothing is filled in from general legal knowledge.
              <Audit m={m} title={(id) => doc.get(id)?.title ?? id} />
            </section>
          ),
        )}

        <form action={ask} className="card stack">
          <input type="hidden" name="matter" value={matter} />
          {thread && <input type="hidden" name="thread" value={thread.id} />}
          <label>{thread ? "Follow-up question" : "Question"}
            <textarea name="question" rows={3} required placeholder="What reliefs does the s.17 application seek? / When was the 13.03.20 injunction passed?" />
          </label>
          {!thread && (
            <div className="row" style={{ alignItems: "center" }}>
              <label style={{ display: "flex", gap: ".4rem", fontWeight: 400 }}><input type="radio" name="scope" value="matter" defaultChecked /> This matter</label>
              <label style={{ display: "flex", gap: ".4rem", fontWeight: 400 }}><input type="radio" name="scope" value="all" /> Across all my matters</label>
            </div>
          )}
          <div><Submit pending="Reading the papers…">Ask</Submit></div>
        </form>
      </div>

      <aside className="rail card">
        <h3>Threads</h3>
        <p><Link href={`/m/${matter}/ask`}>+ New thread</Link></p>
        <ul className="plain">
          {(threads ?? []).map((x) => (
            <li key={x.id} style={{ marginBottom: ".4rem" }}>
              <Link href={`/m/${matter}/ask?t=${x.id}`} style={{ fontWeight: x.id === t ? 700 : 400 }}>{x.title}</Link>
              {!x.matter_id && <span className="pill" style={{ marginLeft: ".3rem" }}>all matters</span>}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Audit({ m, title }: { m: Msg; title: (id: string) => string }) {
  const r = m.retrieved;
  return (
    <details style={{ marginTop: ".6rem" }}>
      <summary className="subtle">Audit: what the model was shown{r.rejected?.length ? `, ${r.rejected.length} statement(s) withheld` : ""}</summary>
      {r.gate && <p className="subtle">Stopped before the model: {r.gate}</p>}
      <ul className="subtle">{(r.chunks ?? []).map((c) => <li key={c.id}>{title(c.doc_id)}, {pages(c.page_start, c.page_end)} · similarity {c.similarity.toFixed(2)}</li>)}</ul>
      {!!r.rejected?.length && <ul>{r.rejected.map((x, i) => <li key={i} className="subtle">Withheld: &ldquo;{x.text}&rdquo; ({x.reason})</li>)}</ul>}
    </details>
  );
}
