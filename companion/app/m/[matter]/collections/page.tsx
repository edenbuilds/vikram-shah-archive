import Link from "next/link";
import { removeFromCollection, saveCollection } from "@/app/actions";
import { fmtDate } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

export default async function Collections({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const [{ data: cols }, { data: docs }, { data: hearings }] = await Promise.all([
    supabase.from("collections").select("id, title, note, hearing_id, collection_items(doc_id, page_no, note)").eq("matter_id", matter).order("created_at"),
    supabase.from("documents").select("id, title").eq("matter_id", matter),
    supabase.from("hearings").select("id, date, status").eq("matter_id", matter).order("date", { ascending: false }),
  ]);
  const title = new Map((docs ?? []).map((d) => [d.id, d.title]));

  return (
    <div className="stack">
      <div>
        <h2>Collections</h2>
        <p className="muted">Working sets that cut across the filing tree, e.g. &ldquo;things to raise at next hearing&rdquo; or &ldquo;disputed figures&rdquo;. Add papers from any paper&apos;s page.</p>
      </div>
      {(cols ?? []).map((c) => (
        <section key={c.id} id={c.id} className="card stack">
          <h3>{c.title}</h3>
          {c.note && <p className="note" style={{ margin: 0 }}><span className="note-label">Advocate&apos;s note</span>{c.note}</p>}
          <ul className="plain doclist">
            {(c.collection_items as { doc_id: string; page_no: number | null; note: string | null }[]).map((it) => (
              <li key={it.doc_id}>
                <span>
                  <Link href={`/m/${matter}/d/${it.doc_id}${it.page_no ? `?p=${it.page_no}` : ""}`}>{title.get(it.doc_id) ?? it.doc_id}</Link>
                  {it.page_no && <span className="pill" style={{ marginLeft: ".3rem" }}>p. {it.page_no}</span>}
                  {it.note && <div className="subtle">{it.note}</div>}
                </span>
                <form action={removeFromCollection}>
                  <input type="hidden" name="matter" value={matter} /><input type="hidden" name="collection" value={c.id} /><input type="hidden" name="doc" value={it.doc_id} />
                  <button className="link subtle">remove</button>
                </form>
              </li>
            ))}
          </ul>
          <details>
            <summary className="subtle">edit / link to a hearing</summary>
            <CollectionForm matter={matter} hearings={hearings ?? []} c={c} />
          </details>
        </section>
      ))}
      <div className="card"><h3>New collection</h3><CollectionForm matter={matter} hearings={hearings ?? []} /></div>
    </div>
  );
}

function CollectionForm({ matter, hearings, c }: { matter: string; hearings: { id: string; date: string; status: string }[]; c?: { id: string; title: string; note: string | null; hearing_id: string | null } }) {
  return (
    <form action={saveCollection} className="stack" style={{ marginTop: ".5rem" }}>
      <input type="hidden" name="matter" value={matter} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <label>Title<input type="text" name="title" required defaultValue={c?.title} /></label>
      <label>Note<textarea name="note" rows={2} defaultValue={c?.note ?? ""} /></label>
      <label>For hearing <span>(shows up in that hearing&apos;s prep brief)</span>
        <select name="hearing" defaultValue={c?.hearing_id ?? ""}>
          <option value="">(none)</option>
          {hearings.map((h) => <option key={h.id} value={h.id}>{fmtDate(h.date)} · {h.status}</option>)}
        </select>
      </label>
      <div><button className="btn small">{c ? "Save" : "Create"}</button></div>
    </form>
  );
}
