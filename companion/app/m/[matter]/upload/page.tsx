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

  return (
    <div className="stack">
      <div>
        <h2>Upload papers</h2>
        <p className="muted">
          One PDF becomes one document. Each is rasterised to page scans, OCR&apos;d page by page (PDF text layer, or Google Vision
          for scanned pages, whichever is denser), split into sections, and indexed for search and Q&amp;A. Unreadable pages
          are marked [ILLEGIBLE]; nothing is guessed. Files stay private to this matter.
        </p>
      </div>
      <Uploader matter={m.id} stages={m.stages} busy={busy} />
      <section className="card">
        <h3>Processing queue</h3>
        <ul className="plain doclist">
          {(jobs ?? []).map((j) => (
            <li key={j.id}>
              <span>
                {j.doc_id ? <Link href={`/m/${m.id}/d/${j.doc_id}`}>{j.title}</Link> : j.title}
                <div className="subtle">{m.stages.find((s) => s.id === j.stage)?.title ?? j.stage} · {j.filename}</div>
                {j.error && <div className="err">{j.error}</div>}
              </span>
              <span className={`pill ${j.status === "done" ? "note" : j.status === "failed" ? "seal" : "warn"}`}>
                {j.status}{j.status === "processing" && j.page_count ? ` ${j.pages_done}/${j.page_count} pp.` : ""}
              </span>
            </li>
          ))}
          {!jobs?.length && <li className="subtle">Nothing uploaded yet.</li>}
        </ul>
        {busy && <p className="subtle">The worker picks up queued files within a few seconds while it is running (<span className="mono">npm run worker</span>).</p>}
      </section>
    </div>
  );
}
