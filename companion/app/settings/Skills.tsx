"use client";
import { unzip } from "fflate";
import { useRef, useState } from "react";
import { addSkill, deleteSkill } from "@/app/actions";

type S = { name: string; description: string; builtIn?: boolean; by?: string; at?: string };

// Her own skills: a SKILL.md, a few Markdown files, or a zip of a skill folder. Read in the browser,
// sent as text, and served to her connected apps by list_skills / get_skill.
export default function Skills({ skills }: { skills: S[] }) {
  const pick = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function add(list: File[]) {
    setMsg(""); setBusy(true);
    const files: Record<string, string> = {};
    try {
      for (const f of list) {
        if (/\.zip$/i.test(f.name)) {
          const buf = new Uint8Array(await f.arrayBuffer());
          const out = await new Promise<Record<string, Uint8Array>>((ok, no) => unzip(buf, { filter: (e) => /\.(md|markdown|txt|json)$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) }, (e, o) => (e ? no(e) : ok(o))));
          for (const [n, u] of Object.entries(out)) files[n] = new TextDecoder().decode(u);
        } else files[f.name] = await f.text();
      }
      const r = await addSkill(files);
      setMsg(r.ok ? `Added "${r.name}". Your connected apps see it in list_skills.` : r.error);
    } catch (e) {
      setMsg(`Could not read that file: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: ".75rem" }}>
      <ul className="plain stack" style={{ gap: ".5rem" }}>
        {skills.map((s) => (
          <li key={s.name} className="card" style={{ padding: ".75rem 1rem" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: ".5rem" }}>
              <b>{s.name}</b>
              <span className="subtle">{s.builtIn ? "In the app" : confirm === s.name ? (
                <>Remove this skill? <button className="link" onClick={async () => { await deleteSkill(s.name); setConfirm(null); }}>Remove</button> <button className="link subtle" onClick={() => setConfirm(null)}>Keep</button></>
              ) : <>Added {s.at ? new Date(s.at).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-") : ""} <button className="link subtle" onClick={() => setConfirm(s.name)}>remove</button></>}</span>
            </div>
            <p className="muted" style={{ margin: ".2rem 0 0" }}>{s.description}</p>
          </li>
        ))}
      </ul>
      <input ref={pick} type="file" hidden multiple accept=".md,.markdown,.txt,.json,.zip" onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; add(l); }} />
      <div className="row" style={{ alignItems: "center", gap: ".75rem" }}>
        <button className="btn" type="button" disabled={busy} onClick={() => pick.current?.click()}>{busy ? "Adding…" : "Add a skill"}</button>
        <span className="subtle">A SKILL.md, a few Markdown files, or a zip of a skill folder.</span>
      </div>
      {msg && <p className={msg.startsWith("Added") ? "muted" : "err"} style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}
