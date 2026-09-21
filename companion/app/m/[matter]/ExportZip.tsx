"use client";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { useState } from "react";

type Paper = { id: string; title: string; stage: string; stageOrder: number; order: number; pages: number; source: string | null; filename: string; sha256: string; pdf: string | null; md: string; docx: string };
type Manifest = { matter: string; originals: { name: string; url: string }[]; papers: Paper[] };

const FORMATS = [
  ["original", "Original file, as uploaded"],
  ["whole", "Whole file as one Markdown"],
  ["pdf", "PDF of each paper"],
  ["docx", "Word of each paper"],
  ["md", "Markdown of each paper"],
] as const;
type Format = (typeof FORMATS)[number][0];

// Download: pick what (the whole matter, or one uploaded file) and which formats; one .zip.
// Built in the browser from the stored files, so size is never capped by a server response.
export default function ExportZip({ matter, files }: { matter: string; files: { name: string; papers: number }[] }) {
  const [only, setOnly] = useState("");
  const [want, setWant] = useState<Set<Format>>(new Set(["original", "whole"]));
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);
  const flip = (f: Format) => setWant((w) => { const n = new Set(w); if (n.has(f)) n.delete(f); else n.add(f); return n; });

  async function go() {
    if (!want.size) { setState("Tick at least one format."); return; }
    setBusy(true); setState("Preparing…");
    try {
      const res = await fetch(`/m/${matter}/export${only ? `?file=${encodeURIComponent(only)}` : ""}`);
      if (!res.ok) throw new Error("Couldn't prepare the download.");
      const man = (await res.json()) as Manifest;
      const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
      const parts: Uint8Array[] = [];
      let failed = 0;
      const zip = new Zip((err, chunk) => { if (!err) parts.push(chunk); });
      const add = (path: string, data: Uint8Array, compress: boolean) => {
        const f = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
        zip.add(f); f.push(data, true);
      };
      const dirOf = (p: Paper) => (/^\d/.test(p.stage) ? clean(p.stage) : `${String(p.stageOrder).padStart(2, "0")} ${clean(p.stage)}`);
      const nameOf = (p: Paper) => `${String(p.order).padStart(3, "0")} ${clean(p.title)}`;
      const mdCache = new Map<string, Uint8Array>();
      const md = async (p: Paper) => { if (!mdCache.has(p.id)) mdCache.set(p.id, await get(p.md)); return mdCache.get(p.id)!; };

      if (want.has("original")) {
        for (const o of man.originals) {
          setState(`Adding original: ${o.name}`);
          try { add(`Original files/${clean(o.name)}`, await get(o.url), false); } catch { failed++; }
        }
      }
      for (const [i, p] of man.papers.entries()) {
        setState(`Adding ${i + 1} of ${man.papers.length}: ${p.title.slice(0, 50)}`);
        try {
          if (want.has("pdf") && p.pdf) add(`PDF/${dirOf(p)}/${nameOf(p)}.pdf`, await get(p.pdf), false);
          if (want.has("docx")) add(`Word/${dirOf(p)}/${nameOf(p)}.docx`, await get(p.docx), false);
          if (want.has("md")) add(`Markdown/${dirOf(p)}/${nameOf(p)}.md`, await md(p), true);
          if (want.has("whole")) await md(p);
        } catch { failed++; }
      }
      if (want.has("whole")) {
        // one Markdown per uploaded file: its papers in order, each with its page markers
        const dec = new TextDecoder();
        for (const fn of [...new Set(man.papers.map((p) => p.filename))]) {
          const ps = man.papers.filter((p) => p.filename === fn);
          const text = [`# ${fn}`, "", `${man.matter}`, "", `${ps.length} paper(s), ${ps.reduce((a, p) => a + p.pages, 0)} pages. Verbatim text as read from the scans; the PDF is the record.`, "",
            "## Contents", "", ...ps.map((p, k) => `${k + 1}. ${p.title} (${p.pages} pp.)`),
            ...ps.flatMap((p) => ["", "---", "", mdCache.has(p.id) ? dec.decode(mdCache.get(p.id)).replace(/^# /, "## ").replace(/\n## Page /g, "\n### Page ") : `## ${p.title}\n\n(could not be fetched)`])].join("\n");
          add(`${clean(fn.replace(/\.[a-z0-9]+$/i, ""))}.md`, new TextEncoder().encode(text), true);
        }
      }
      const rows = [["No.", "Stage", "Paper", "Pages", "From", "SHA-256 of PDF"], ...man.papers.map((p) => [String(p.order), p.stage, p.title, String(p.pages), p.source ?? "", p.sha256])];
      add("Index of papers.csv", new TextEncoder().encode("﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n")), true);
      zip.end();
      const blob = new Blob(parts as BlobPart[], { type: "application/zip" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${clean(only ? only.replace(/\.[a-z0-9]+$/i, "") : man.matter)}.zip` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setState(failed ? `Downloaded, but ${failed} item(s) could not be fetched. Try again.` : `Downloaded (${(blob.size / 1e6).toFixed(1)} MB).`);
    } catch (e) {
      setState((e as Error).message || "Download failed. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="stack export" style={{ gap: ".6rem" }}>
      {files.length > 0 && (
        <label>What
          <select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">Everything in this matter</option>
            {files.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.papers} paper{f.papers === 1 ? "" : "s"})</option>)}
          </select>
        </label>
      )}
      <fieldset className="formats">
        <legend>Formats</legend>
        {FORMATS.map(([f, label]) => (
          <label key={f}><input type="checkbox" checked={want.has(f)} onChange={() => flip(f)} /> {label}</label>
        ))}
      </fieldset>
      <button type="button" className="btn" onClick={go} disabled={busy}>{busy ? "Preparing…" : "Download (.zip)"}</button>
      {state && <p className="subtle" style={{ margin: 0 }} role="status">{state}</p>}
    </div>
  );
}
