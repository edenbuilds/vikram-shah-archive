import Link from "next/link";
import PinButton from "@/components/PinButton";
import { embed } from "@/lib/ai";
import { MIN_SIMILARITY } from "@/lib/qa";
import { getPins, pinId } from "@/lib/study";
import { requireUser } from "@/lib/supabase";

type Hit = { id: number; doc_id: string; page_start: number; page_end: number; text: string; similarity?: number; fts_rank?: number };

// One search over every matter she can see: the same point, order or party across her files.
// Results are passages as they stand in the papers, grouped by matter, each linked to its page.
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string; exact?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  const exact = sp.exact === "1";
  const { supabase, user } = await requireUser();
  const { data: matters } = await supabase.from("matters").select("id, title").order("created_at");
  const ids = (matters ?? []).map((m) => m.id);

  let hits: Hit[] = [];
  if (q) {
    const [sem, lex] = await Promise.all([
      exact ? Promise.resolve({ data: [] as Hit[] }) : embed(q).then((e) => supabase.rpc("match_chunks", { query_embedding: e, query_text: q, matter_ids: ids, match_count: 60 })),
      supabase.from("chunks").select("id, doc_id, page_start, page_end, text").in("matter_id", ids).textSearch("tsv", q, { type: "websearch", config: "english" }).limit(60),
    ]);
    const seen = new Set<number>();
    for (const h of [...((lex.data ?? []) as Hit[]), ...((sem.data ?? []) as Hit[]).filter((h) => (h.similarity ?? 0) >= MIN_SIMILARITY || (h.fts_rank ?? 0) > 0)]) {
      if (!seen.has(h.id)) { seen.add(h.id); hits.push(h); }
    }
    hits = hits.slice(0, 80);
  }
  const docIds = [...new Set(hits.map((h) => h.doc_id))];
  const [{ data: docs }, pins] = await Promise.all([
    docIds.length ? supabase.from("documents").select("id, title, matter_id").in("id", docIds) : Promise.resolve({ data: [] as { id: string; title: string; matter_id: string }[] }),
    getPins(user.email!),
  ]);
  const doc = new Map((docs ?? []).map((d) => [d.id, d]));
  const pinned = new Set(pins.map((p) => p.id));
  const terms = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
  const snip = (text: string) => {
    const flat = text.replace(/\s+/g, " ").trim();
    const at = terms.map((t) => flat.toLowerCase().indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
    const a = at > 160 ? flat.indexOf(" ", at - 160) + 1 : 0;
    const b = flat.indexOf(" ", Math.min(flat.length, a + 380));
    return flat.slice(a, b < 0 ? flat.length : b);
  };
  const mark = (s: string) => {
    if (!terms.length) return s;
    const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return s.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  };
  const byMatter = (matters ?? []).map((m) => ({ ...m, hits: hits.filter((h) => doc.get(h.doc_id)?.matter_id === m.id) })).filter((m) => m.hits.length);

  return (
    <main className="wrap stack" style={{ paddingTop: "1.5rem" }}>
      <div>
        <h1 style={{ marginBottom: ".3rem" }}>Search every matter</h1>
        <p className="muted" style={{ margin: 0 }}>Find the same point, order or party across all your files. Passages as they stand in the papers, each linked to its page.</p>
      </div>
      <form className="card row" style={{ alignItems: "end" }}>
        <label style={{ flex: "1 1 18rem" }}>Search for
          <input type="search" name="q" defaultValue={q} placeholder="refund with interest, Oberoi, order dated 09.07.2026…" autoFocus={!q} />
        </label>
        <label className="check" style={{ flex: "0 0 auto" }}><input type="checkbox" name="exact" value="1" defaultChecked={exact} /> Exact words only</label>
        <button className="btn" style={{ flex: "0 0 auto" }}>Search</button>
      </form>

      {q && !byMatter.length && <p className="muted">Nothing in the papers on file matches &ldquo;{q}&rdquo;.</p>}
      {q && !!byMatter.length && <p className="subtle" style={{ margin: 0 }}>{hits.length} passage{hits.length > 1 ? "s" : ""} in {byMatter.length} matter{byMatter.length > 1 ? "s" : ""}</p>}
      {byMatter.map((m) => (
        <section key={m.id} className="card">
          <h3 style={{ marginBottom: ".4rem" }}><Link href={`/m/${m.id}`} style={{ textDecoration: "none" }}>{m.title}</Link> <span className="subtle">{m.hits.length}</span></h3>
          {m.hits.map((h) => {
            const d = doc.get(h.doc_id)!;
            const s = snip(h.text);
            return (
              <div key={h.id} className="receipt-wrap">
                <Link href={`/m/${m.id}/d/${h.doc_id}?p=${h.page_start}`} className="receipt bare">
                  <span><q>{mark(s)}</q><cite>{d.title}, p. {h.page_start}{h.page_end !== h.page_start ? `-${h.page_end}` : ""} →</cite></span>
                </Link>
                <PinButton matter={m.id} doc={h.doc_id} page={h.page_start} quote={s} on={pinned.has(pinId(h.doc_id, h.page_start, s))} />
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}
