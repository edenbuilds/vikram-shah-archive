"use client";
import CopyButton from "@/app/CopyButton";

// Copy the pinned references, or save them as a Markdown file, ready for a draft.
export default function Tools({ text, md, name, copyLabel = "Copy as references" }: { text: string; md: string; name: string; copyLabel?: string }) {
  const save = () => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([md], { type: "text/markdown" })), download: `${name}.md` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  return (
    <div className="row" style={{ gap: ".5rem", flex: "0 0 auto" }}>
      <CopyButton text={text} label={copyLabel} />
      <button type="button" className="btn ghost small" onClick={save}>Save .md</button>
    </div>
  );
}
