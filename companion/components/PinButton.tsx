"use client";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { togglePin } from "@/app/actions";

// Pin a receipt to her draft list. The server re-checks the quote against the page before saving.
export default function PinButton({ matter, doc, page, quote, on = false }: { matter: string; doc: string; page: number; quote: string; on?: boolean }) {
  const [pinned, setPinned] = useState(on);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  return (
    <button type="button" className={`pin-btn${pinned ? " on" : ""}`} disabled={pending} aria-pressed={pinned}
      title={err ? "Could not pin: the quote was not found on that page" : pinned ? "Pinned to your draft list. Tap to unpin" : "Pin to your draft list"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); start(async () => { const r = await togglePin({ matter, doc, page, quote }); setErr(!r.ok); if (r.ok) setPinned(r.pinned); }); }}>
      {pinned ? <BookmarkCheck size={15} strokeWidth={1.8} aria-hidden /> : <Bookmark size={15} strokeWidth={1.8} aria-hidden />}
      <span>{err ? "Not on page" : pinned ? "Pinned" : "Pin"}</span>
    </button>
  );
}
