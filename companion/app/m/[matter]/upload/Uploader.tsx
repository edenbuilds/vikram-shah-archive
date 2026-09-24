"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { unzip } from "fflate";
import { useEffect, useRef, useState } from "react";
import { queueUpload } from "@/app/actions";
import type { Stage } from "@/lib/taxonomies";

type Row = { file: File; title: string; state: string; pct?: number };

// What the worker turns into a PDF (worker/worker.py as_pdf). A zip is opened here and each paper in it
// goes up on its own, so one bad file in a zip does not hold up the rest.
const OK = /\.(pdf|jpe?g|png|heic|heif|tiff?|gif|bmp|webp|docx?|rtf|odt|html?|md|markdown|txt|csv)$/i;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.tif,.tiff,.gif,.bmp,.webp,.doc,.docx,.rtf,.odt,.html,.htm,.md,.markdown,.txt,.csv,.zip,image/*";
const unzipped = (f: File) => f.arrayBuffer().then((b) => new Promise<File[]>((ok, no) =>
  unzip(new Uint8Array(b), { filter: (e) => OK.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) }, (err, out) =>
    err ? no(err) : ok(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).map(([n, u]) => new File([u as BlobPart], n.split("/").pop()!))))));

export default function Uploader({ matter, stages, busy }: { matter: string; stages: Stage[]; busy: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState(stages[0]?.id ?? "other");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [asked, setAsked] = useState<number | null>(null); // papers just queued: ask about another
  const [skipped, setSkipped] = useState<string[]>([]);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [busy, router]);

  async function add(files: FileList | File[] | null) {
    setAsked(null);
    const all: File[] = [], bad: string[] = [];
    for (const f of Array.from(files ?? [])) {
      if (/\.zip$/i.test(f.name)) {
        try { all.push(...(await unzipped(f))); } catch { bad.push(`${f.name} (could not open the zip)`); }
      } else if (OK.test(f.name) || f.type.startsWith("image/")) all.push(f);
      else bad.push(f.name);
    }
    setSkipped(bad);
    setRows((rs) => [...rs, ...all.map((file) => ({ file, title: file.name.replace(/\.[a-z0-9]+$/i, ""), state: "ready" }))]);
  }
  // Files go up in 6 MB pieces (<path>.part000, .part001, ...), each retried on its own, and the worker
  // joins them back into the exact original. 2026-09-22: a 70 MB volume sent as 45 MB pieces failed
  // on the office connection with nothing to show; one dropped request lost the whole piece.
  const PIECE = 6 * 1024 * 1024;

  function put(url: string, token: string, body: Blob, onBytes: (n: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", url);
      x.setRequestHeader("Authorization", `Bearer ${token}`);
      x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      x.setRequestHeader("Content-Type", "application/octet-stream");
      x.upload.onprogress = (e) => onBytes(e.loaded);
      // a retry of a piece that did arrive (reply lost) comes back "already exists": that is success
      x.onload = () => (x.status < 300 || /exist|duplicate/i.test(x.responseText) ? resolve() : reject(new Error(`${x.status} ${x.responseText.slice(0, 120)}`)));
      x.onerror = () => reject(new Error("connection dropped"));
      x.ontimeout = () => reject(new Error("timed out"));
      x.timeout = 120000;
      x.send(body);
    });
  }

  async function start() {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    setRunning(true);
    let queued = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.state === "queued") continue;
      const set = (state: string, pct?: number) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, state, pct } : x)));
      set("uploading", 0);
      const safe = r.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
      const path = `${matter}/uploads/${crypto.randomUUID()}-${safe}`;
      const n = Math.ceil(r.file.size / PIECE) || 1;
      let failed = "";
      for (let k = 0; k < n && !failed; k++) {
        const piece = r.file.slice(k * PIECE, (k + 1) * PIECE);
        const name = n === 1 ? path : `${path}.part${String(k).padStart(3, "0")}`;
        for (let attempt = 1; ; attempt++) {
          try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (!token) throw new Error("signed out, please sign in again");
            await put(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/companion/${name.split("/").map(encodeURIComponent).join("/")}`, token, piece,
              (b) => set("uploading", Math.min(99, Math.round((100 * (k * PIECE + b)) / r.file.size))));
            break;
          } catch (e) {
            if (attempt >= 5) { failed = (e as Error).message; break; }
            set(`retrying (${(e as Error).message})`, Math.round((100 * k * PIECE) / r.file.size));
            await new Promise((w) => setTimeout(w, 2000 * attempt));
          }
        }
      }
      if (failed) { set(`failed: ${failed}. Press Upload to try again.`); continue; }
      try {
        await queueUpload({ matter, stage, title: r.title.trim() || r.file.name, filename: r.file.name, path });
        set("queued");
        queued++;
      } catch (e) {
        set(`failed: ${(e as Error).message}`);
      }
    }
    setRunning(false);
    setRows((rs) => rs.filter((r) => r.state !== "queued"));
    setAsked(queued);
    router.refresh();
  }

  return (
    <section className="card stack">
      <label className={`dropzone${over ? " over" : ""}`} style={{ position: "relative" }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <input ref={pick} type="file" multiple accept={ACCEPT} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <b>Drop files here</b>
        <span className="subtle">or click to choose. PDF, Word, Markdown or text, photos of pages (JPG, PNG, HEIC), or a zip of any of these. A volume with an index is split into its papers.</span>
      </label>
      {!!skipped.length && <p className="err" style={{ margin: 0 }}>Not added, this kind of file can&apos;t be read yet: {skipped.join(", ")}. Save it as a PDF and add that.</p>}

      {asked !== null && !rows.length && (
        <div className="ask-first" role="dialog" aria-label="Add another document">
          <p>{asked ? <><b>{asked} {asked === 1 ? "paper is" : "papers are"} in the queue.</b> </> : null}Add another document to this matter?</p>
          <div className="row" style={{ gap: ".5rem" }}>
            <button className="btn" type="button" onClick={() => pick.current?.click()}>Add another</button>
            <button className="btn ghost" type="button" onClick={() => setAsked(null)}>No, that&apos;s all</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <label style={{ maxWidth: "26rem" }}>File these under
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ alignItems: "center" }}>
              <label style={{ flex: "4 1 18rem" }}>Title as it should appear
                <input type="text" value={r.title} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
              </label>
              <span className="subtle" style={{ flex: "1 1 8rem" }}>{(r.file.size / 1e6).toFixed(1)} MB · {r.state}{r.pct !== undefined && r.state === "uploading" ? ` ${r.pct}%` : ""}
                {r.pct !== undefined && <span className="bar" role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100} style={{ display: "block" }}><i style={{ width: `${r.pct}%`, background: "var(--seal)" }} /></span>}
              </span>
              {!running && <button type="button" className="link subtle" style={{ flex: "0 0 auto" }} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>remove</button>}
            </div>
          ))}
          <div><button className="btn" disabled={running} onClick={start}>{running ? "Uploading…" : `Upload ${rows.length} file${rows.length === 1 ? "" : "s"}`}</button></div>
        </>
      )}
    </section>
  );
}
