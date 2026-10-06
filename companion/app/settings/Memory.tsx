"use client";
import { toast } from "@/components/Toast";
import { useState } from "react";
import { deleteMemory, saveMemory } from "@/app/actions";
import type { Memory as M } from "@/lib/memory";

const SOURCE = { web: "here", telegram: "Telegram", ai: "a connected app" } as const;
const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");

// The same list her connected apps (get_memory / remember) and Telegram (/memory, /remember) read and write.
export default function Memory({ items, matters }: { items: M[]; matters: { id: string; title: string }[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const title = (id: string | null) => (id ? matters.find((m) => m.id === id)?.title ?? id : "All matters");

  return (
    <div className="stack" style={{ gap: ".75rem" }}>
      {!!items.length && (
        <ul className="plain stack" style={{ gap: ".5rem" }}>
          {items.map((x) => (
            <li key={x.id} className="card" style={{ padding: ".75rem 1rem" }}>
              {editing === x.id ? (
                <form action={async (f) => { await saveMemory(f); setEditing(null); toast("Saved to memory"); }} className="stack" style={{ gap: ".5rem" }}>
                  <input type="hidden" name="id" value={x.id} />
                  <textarea name="text" defaultValue={x.text} rows={2} maxLength={500} required aria-label="Memory text" />
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn small">Save</button>
                  </div>
                </form>
              ) : (
                <>
                  <p style={{ margin: 0 }}>{x.text}</p>
                  <div className="row subtle" style={{ justifyContent: "space-between", gap: ".5rem", marginTop: ".25rem" }}>
                    <span>{title(x.matter)} · saved from {SOURCE[x.source]} · {dmy(x.at)}</span>
                    <span>{confirm === x.id ? (
                      <>Forget this? <button className="link" onClick={async () => { await deleteMemory(x.id); setConfirm(null); toast("Forgotten"); }}>Forget</button> <button className="link subtle" onClick={() => setConfirm(null)}>Keep</button></>
                    ) : <><button className="link subtle" onClick={() => setEditing(x.id)}>edit</button> <button className="link subtle" onClick={() => setConfirm(x.id)}>forget</button></>}</span>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form action={saveMemory} className="stack" style={{ gap: ".5rem" }} key={items.length}>
        <textarea name="text" rows={2} maxLength={500} required placeholder="e.g. Dates as DD-MM-YYYY in every draft" aria-label="Something to remember" />
        <div className="row" style={{ gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
          <select name="matter" defaultValue="" aria-label="Which matters">
            <option value="">All matters</option>
            {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <button className="btn">Remember</button>
        </div>
      </form>
    </div>
  );
}
