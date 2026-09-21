"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { queueUpload } from "@/app/actions";
import type { Stage } from "@/lib/taxonomies";

type Row = { file: File; title: string; state: string };

export default function Uploader({ matter, stages, busy }: { matter: string; stages: Stage[]; busy: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState(stages[0]?.id ?? "other");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [busy, router]);

  const add = (files: FileList | File[] | null) =>
    setRows((rs) => [...rs, ...Array.from(files ?? []).map((file) => ({ file, title: file.name.replace(/\.[a-z0-9]+$/i, ""), state: "ready" }))]);
  // Storage takes at most 50 MB per object on this plan, so bigger files go up in 45 MB pieces
  // (<path>.part000, .part001, ...) and the worker joins them back into the exact original.
  const PIECE = 45 * 1024 * 1024;

  async function start() {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.state === "queued") continue;
      const set = (state: string) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, state } : x)));
      set("uploading…");
      const safe = r.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
      const path = `${matter}/uploads/${crypto.randomUUID()}-${safe}`;
      const type = r.file.type || "application/octet-stream";
      let error: { message: string } | null = null;
      if (r.file.size <= PIECE) {
        ({ error } = await supabase.storage.from("companion").upload(path, r.file, { contentType: type }));
      } else {
        const n = Math.ceil(r.file.size / PIECE);
        for (let k = 0; k < n && !error; k++) {
          set(`uploading part ${k + 1} of ${n}…`);
          ({ error } = await supabase.storage.from("companion").upload(`${path}.part${String(k).padStart(3, "0")}`,
            r.file.slice(k * PIECE, (k + 1) * PIECE), { contentType: "application/octet-stream" }));
        }
      }
      if (error) { set(`failed: ${error.message}`); continue; }
      try {
        await queueUpload({ matter, stage, title: r.title.trim() || r.file.name, filename: r.file.name, path });
        set("queued");
      } catch (e) {
        set(`failed: ${(e as Error).message}`);
      }
    }
    setRunning(false);
    setRows((rs) => rs.filter((r) => r.state !== "queued"));
    router.refresh();
  }

  return (
    <section className="card stack">
      <label className={`dropzone${over ? " over" : ""}`} style={{ position: "relative" }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <input type="file" multiple onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <b>Drop files here</b>
        <span className="subtle">or click to choose. PDFs of any size, and photos of pages. A volume with an index is split into its papers.</span>
      </label>

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
              <span className="subtle" style={{ flex: "1 1 8rem" }}>{(r.file.size / 1e6).toFixed(1)} MB · {r.state}</span>
              {!running && <button type="button" className="link subtle" style={{ flex: "0 0 auto" }} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>remove</button>}
            </div>
          ))}
          <div><button className="btn" disabled={running} onClick={start}>{running ? "Uploading…" : `Upload ${rows.length} file${rows.length === 1 ? "" : "s"}`}</button></div>
        </>
      )}
    </section>
  );
}
