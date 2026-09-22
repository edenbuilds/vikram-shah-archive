"use client";
import { useRef } from "react";

type Field = { name: string; label: string; value: string | null };

// In-app dialog (never the browser's prompt) for renaming a matter or a paper.
export default function EditDialog({ action, hidden, fields, label = "Edit" }: {
  action: (f: FormData) => Promise<void>; hidden: Record<string, string>; fields: Field[]; label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="link subtle" onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="card edit-dialog" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <form action={async (f) => { await action(f); ref.current?.close(); }} className="stack">
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {fields.map((x) => (
            <label key={x.name}>{x.label}
              <input type="text" name={x.name} defaultValue={x.value ?? ""} required={x.name === "title"} />
            </label>
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancel</button>
            <button className="btn">Save</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
