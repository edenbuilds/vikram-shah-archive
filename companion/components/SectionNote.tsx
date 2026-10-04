"use client";
import { useState } from "react";
import { saveSectionNote } from "@/app/actions";
import { toast } from "@/components/Toast";

// Her own words under one part of the explainer or brief. The part itself is receipted from the papers and stays
// as made; this is her work product beside it (04-10-2026: Omkar: "make everything editable").
export default function SectionNote({ matter, kind, sectionKey, initial }: { matter: string; kind: "explainer" | "brief"; sectionKey: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(false);
  if (editing) return (
    <form className="stack" style={{ gap: ".4rem", marginTop: ".6rem" }} action={async (f) => {
      await saveSectionNote(f); setText(String(f.get("text") ?? "").trim()); setEditing(false); toast(String(f.get("text") ?? "").trim() ? "Note saved" : "Note removed");
    }}>
      <input type="hidden" name="matter" value={matter} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="key" value={sectionKey} />
      <textarea name="text" defaultValue={text} rows={3} maxLength={4000} autoFocus aria-label="Your note on this part" placeholder="Your own note. Leave empty to remove it." />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>Cancel</button>
        <button className="btn small">Save</button>
      </div>
    </form>
  );
  return text ? (
    <aside className="note" style={{ marginTop: ".6rem" }}>
      <span className="note-label">Your note</span>
      <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
      <button type="button" className="link subtle" data-edit onClick={() => setEditing(true)}>edit</button>
    </aside>
  ) : <button type="button" className="link subtle" style={{ marginTop: ".5rem" }} onClick={() => setEditing(true)}>Add your note</button>;
}
