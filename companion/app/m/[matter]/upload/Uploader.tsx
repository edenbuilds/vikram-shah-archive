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

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [busy, router]);

  async function start() {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const set = (state: string) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, state } : x)));
      set("uploading…");
      const safe = r.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
      const path = `${matter}/uploads/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("companion").upload(path, r.file, { contentType: "application/pdf" });
      if (error) { set(`failed: ${error.message}`); continue; }
      await queueUpload({ matter, stage, title: r.title.trim() || r.file.name, filename: r.file.name, path });
      set("queued");
    }
    setRunning(false);
    setRows((rs) => rs.filter((r) => r.state !== "queued"));
    router.refresh();
  }

  return (
    <section className="card stack">
      <div className="row">
        <label>File under
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <label>PDFs
          <input type="file" accept="application/pdf" multiple onChange={(e) =>
            setRows(Array.from(e.target.files ?? []).map((file) => ({ file, title: file.name.replace(/\.pdf$/i, ""), state: "ready" })))} />
        </label>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ alignItems: "center" }}>
          <label style={{ flex: "4 1 18rem" }}>Title as it should appear
            <input type="text" value={r.title} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
          </label>
          <span className="subtle" style={{ flex: "1 1 8rem" }}>{(r.file.size / 1e6).toFixed(1)} MB · {r.state}</span>
        </div>
      ))}
      <div><button className="btn" disabled={!rows.length || running} onClick={start}>{running ? "Uploading…" : `Upload ${rows.length || ""} PDF${rows.length === 1 ? "" : "s"}`}</button></div>
    </section>
  );
}
