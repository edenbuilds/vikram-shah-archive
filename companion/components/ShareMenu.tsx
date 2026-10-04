"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import { toast } from "@/components/Toast";
import { haptic } from "@/lib/haptic";

type Item = { label: string; href: string };

// 04-10-2026: Omkar: "export/share option should appear". One menu for both: the link to this page (it opens for anyone
// with access to the matter), the phone's own share sheet where there is one, and the downloads for this page.
export default function ShareMenu({ title, items = [] }: { title: string; items?: Item[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", away);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", away); };
  }, [open]);
  const url = () => location.href;
  const copy = async () => { await navigator.clipboard.writeText(url()); haptic("ok"); toast("Link copied"); setOpen(false); };
  const share = async () => { setOpen(false); try { await navigator.share({ title, url: url() }); } catch { /* she closed the sheet */ } };
  return (
    <div ref={box} className="share">
      <button type="button" className="btn ghost small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Share2 size={14} strokeWidth={1.75} aria-hidden /> Share and export</button>
      {open && (
        <div className="account-menu share-menu" role="menu">
          {"share" in navigator && <button role="menuitem" onClick={share}><Share2 size={15} strokeWidth={1.75} aria-hidden /> Share…</button>}
          <button role="menuitem" onClick={copy}><Copy size={15} strokeWidth={1.75} aria-hidden /> Copy link</button>
          {items.length > 0 && <p className="subtle">Export</p>}
          {items.map((i) => <a key={i.href} role="menuitem" href={i.href} onClick={() => { haptic("tick"); setOpen(false); }}><Download size={15} strokeWidth={1.75} aria-hidden /> {i.label}</a>)}
        </div>
      )}
    </div>
  );
}
