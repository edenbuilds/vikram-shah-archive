"use client";
import { useState } from "react";
import CopyButton from "../CopyButton";

type P = { name: string; title: string; description: string; text: string; args: readonly string[] };

// One-click research prompts. The matter is filled in; other blanks stay as [brackets] to edit.
export default function Prompts({ prompts, matters }: { prompts: readonly P[]; matters: { id: string; title: string }[] }) {
  const [m, setM] = useState(matters[0]?.title ?? "");
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => (k === "matter" ? m : `[${k}]`));
  return (
    <div className="stack">
      <label style={{ maxWidth: "28rem" }}>Matter
        <select value={m} onChange={(e) => setM(e.target.value)}>
          {matters.map((x) => <option key={x.id} value={x.title}>{x.title}</option>)}
        </select>
      </label>
      <div className="prompts">
        {prompts.map((p) => (
          <article key={p.name} className="card">
            <div className="row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
              <h3 style={{ margin: 0, flex: "1 1 auto" }}>{p.title}</h3>
              <CopyButton text={fill(p.text)} />
            </div>
            <p className="subtle" style={{ margin: ".35rem 0 0" }}>{fill(p.text)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
