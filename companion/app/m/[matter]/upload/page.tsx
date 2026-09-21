import Link from "next/link";
import { getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import Uploader from "./Uploader";

export default async function Upload({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const { data: jobs } = await supabase.from("ingest_jobs").select("id, title, filename, stage, status, error, doc_id, page_count, pages_done, created_at")
    .eq("matter_id", matter).order("created_at", { ascending: false }).limit(50);
  const busy = (jobs ?? []).some((j) => j.status === "queued" || j.status === "processing");
  // A compiled volume is filed as several papers, all carrying the upload's filename.
  const { data: filed } = await supabase.from("documents").select("filename").eq("matter_id", matter);
  const papersFrom = (fn: string) => (filed ?? []).filter((d) => d.filename === fn).length;

  return (
    <div className="stack">
      <div>
        <h2>Upload papers</h2>
        <p className="muted">
          A compiled volume with an index is split into its separate papers, each named as the index lists it;
          any other PDF becomes one paper. Each is rasterised to page scans, OCR&apos;d page by page (PDF text layer, or Google Vision
          for scanned pages, whichever is denser), split into sections, and indexed for search and Q&amp;A. Unreadable pages
          are marked [ILLEGIBLE]; nothing is guessed. Files stay private to this matter.
        </p>
      </div>
      <Uploader matter={m.id} stages={m.stages} busy={busy} />
      {!!jobs?.length && (
        <section className="card">
          <h3>Processing queue</h3>
          <ul className="plain queue">
            {jobs.map((j) => (
              <li key={j.id}>
                <span style={{ minWidth: 0 }}>
                  {j.doc_id ? <Link href={papersFrom(j.filename) > 1 ? `/m/${m.id}/map` : `/m/${m.id}/d/${j.doc_id}`} style={{ fontFamily: "var(--serif)" }}>{j.title}</Link> : <span style={{ fontFamily: "var(--serif)" }}>{j.title}</span>}
                  <div className="subtle">{m.stages.find((s) => s.id === j.stage)?.title ?? j.stage} · {j.filename}</div>
                  {j.status === "processing" && j.page_count ? <div className="bar"><i style={{ width: `${Math.round((100 * j.pages_done) / j.page_count)}%` }} /></div> : null}
                  {j.error && <div className="err">{j.error}</div>}
                </span>
                <span className={`pill ${j.status === "done" ? "ok" : j.status === "failed" ? "seal" : "warn"}`}>
                  {j.status === "done" ? (papersFrom(j.filename) > 1 ? `filed as ${papersFrom(j.filename)} papers` : "filed") : j.status}{j.status === "processing" && j.page_count ? ` · ${j.pages_done}/${j.page_count} pp.` : ""}
                </span>
              </li>
            ))}
          </ul>
          {busy && <p className="subtle" style={{ margin: ".6rem 0 0" }}>Processing on the office Mac; this list updates by itself.</p>}
        </section>
      )}
    </div>
  );
}
