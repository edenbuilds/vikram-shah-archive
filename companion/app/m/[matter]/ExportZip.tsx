"use client";
import { Zip, ZipPassThrough, ZipDeflate } from "fflate";
import { useState } from "react";

type Paper = { id: string; title: string; stage: string; stageOrder: number; order: number; pages: number; source: string | null; sha256: string; pdf: string | null; md: string };

// "Download everything": every paper's PDF (the stored file itself) and its verbatim text,
// filed by stage, plus an index. Built in the browser, streamed into one .zip.
export default function ExportZip({ matter, files }: { matter: string; files: { name: string; papers: number }[] }) {
  const [only, setOnly] = useState("");
  const [state, setState] = useState("");
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);

  async function go() {
    setState("Preparing…");
    const res = await fetch(`/m/${matter}/export${only ? `?file=${encodeURIComponent(only)}` : ""}`);
    if (!res.ok) { setState("Couldn't prepare the download. Try again."); return; }
    const { matter: title, papers } = (await res.json()) as { matter: string; papers: Paper[] };
    const root = clean(title);
    const parts: Uint8Array[] = [];
    let failed = 0;
    await new Promise<void>((resolve, reject) => {
      const zip = new Zip((err, chunk, final) => { if (err) reject(err); else { parts.push(chunk); if (final) resolve(); } });
      const add = (path: string, data: Uint8Array, compress: boolean) => {
        const f = compress ? new ZipDeflate(`${root}/${path}`, { level: 6 }) : new ZipPassThrough(`${root}/${path}`);
        zip.add(f); f.push(data, true);
      };
      (async () => {
        const rows = [["No.", "Stage", "Paper", "Pages", "From", "PDF file", "SHA-256"]];
        for (const [i, p] of papers.entries()) {
          setState(`Adding ${i + 1} of ${papers.length}: ${p.title.slice(0, 50)}`);
          const dir = /^\d/.test(p.stage) ? clean(p.stage) : `${String(p.stageOrder).padStart(2, "0")} ${clean(p.stage)}`; // stage titles already carry their number
          const base = `${String(p.order).padStart(3, "0")} ${clean(p.title)}`;
          try {
            if (p.pdf) add(`${dir}/${base}.pdf`, new Uint8Array(await (await fetch(p.pdf)).arrayBuffer()), false);
            add(`${dir}/${base}.md`, new Uint8Array(await (await fetch(p.md)).arrayBuffer()), true);
          } catch { failed++; }
          rows.push([String(p.order), p.stage, p.title, String(p.pages), p.source ?? "", p.pdf ? `${dir}/${base}.pdf` : "(no PDF)", p.sha256]);
        }
        const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
        add("Index of papers.csv", new TextEncoder().encode("﻿" + csv), true);
        zip.end();
      })().catch(reject);
    });
    const blob = new Blob(parts as BlobPart[], { type: "application/zip" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${clean(only ? only.replace(/\.pdf$/i, "") : title)}.zip` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    setState(failed ? `Downloaded, but ${failed} paper(s) could not be fetched. Try again for those.` : `Downloaded ${papers.length} papers (${(blob.size / 1e6).toFixed(1)} MB).`);
  }

  return (
    <div className="stack" style={{ gap: ".5rem" }}>
      <div className="row" style={{ alignItems: "end" }}>
        {files.length > 1 && (
          <label style={{ flex: "1 1 14rem" }}>What to include
            <select value={only} onChange={(e) => setOnly(e.target.value)}>
              <option value="">Every paper in this matter</option>
              {files.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.papers} papers)</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn" style={{ flex: "0 0 auto" }} onClick={go} disabled={!!state && !state.startsWith("Downloaded") && !state.startsWith("Couldn")}>Download everything (.zip)</button>
      </div>
      <p className="subtle" style={{ margin: 0 }}>{state || "Each paper's original PDF and its text (.md), filed by stage, with an index spreadsheet."}</p>
    </div>
  );
}
