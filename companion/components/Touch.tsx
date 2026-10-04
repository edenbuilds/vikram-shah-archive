"use client";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Share2, ArrowUpRight } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { toast } from "@/components/Toast";

// 04-10-2026: Omkar: "enable 3d touch/haptic touch/double click and hover interactions wherever required". Three things, all
// delegated from the document so no page has to opt in:
//  1. a tick under the finger on every control (touch only)
//  2. press and hold a matter, a paper or a hearing: a menu with Open, Open in a new tab, Copy link and Share. A phone has no
//     right-click, and the physical 3D Touch that used to do this is gone from iPhones; a mouse keeps its own right-click
//  3. double-click, or double-tap, a note or an explainer part to edit it (the element carries data-dbl; its Edit button data-edit)
// Hover states are plain CSS (globals.css); they are gated to devices that hover so a touch does not leave one stuck.
const HOLD = "a.matter-card, a.docrow, a.stat";
const TICK = "button, summary, [role=tab], [role=menuitem], .pillnav a, .tabs a, .swatch, .matter-card, .docrow";
type Menu = { x: number; y: number; href: string; title: string };

export default function Touch() {
  const [menu, setMenu] = useState<Menu | null>(null);
  useEffect(() => {
    let timer: number | undefined, from = { x: 0, y: 0 }, held = false, lastTap = { el: null as Element | null, at: 0 };
    const edit = (t: Element | null) => { if (document.querySelector("dialog[open]")) return; const b = t?.closest("[data-dbl]")?.querySelector<HTMLElement>("[data-edit]"); if (b) { haptic("tick"); b.click(); } };
    const idle = (t: EventTarget | null) => !(t as Element | null)?.closest?.("button, a, input, textarea, select, summary");
    const down = (e: PointerEvent) => {
      held = false;  // a long press whose click never came (the browser took over) must not swallow the next tap
      if (e.pointerType === "mouse") return;
      const el = e.target as Element | null;
      if (el?.closest(TICK) && !el.closest(":disabled")) haptic("tick");
      const a = el?.closest<HTMLAnchorElement>(HOLD);
      if (!a) return;
      from = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        held = true; haptic("ok");
        setMenu({ x: from.x, y: from.y, href: a.href, title: (a.querySelector("h2, .dt")?.textContent ?? a.textContent ?? "").trim().slice(0, 80) });
      }, 480);
    };
    const move = (e: PointerEvent) => { if (timer && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) { clearTimeout(timer); timer = undefined; } };
    const cancel = () => { clearTimeout(timer); timer = undefined; };
    const up = (e: PointerEvent) => {
      cancel();
      if (e.pointerType === "mouse" || !idle(e.target)) return;
      const t = (e.target as Element).closest("[data-dbl]");  // a phone fires no dblclick, so a second tap within 300 ms is one
      if (t && lastTap.el === t && e.timeStamp - lastTap.at < 300) edit(t); lastTap = { el: t, at: e.timeStamp };
    };
    const click = (e: MouseEvent) => { if (held) { held = false; e.preventDefault(); e.stopPropagation(); } };
    const context = (e: Event) => { if (held || timer) e.preventDefault(); };
    const dbl = (e: MouseEvent) => { if (idle(e.target)) edit(e.target as Element); };
    const away = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".quick-menu")) setMenu(null); };
    document.addEventListener("pointerdown", down, true); document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("click", click, true); document.addEventListener("contextmenu", context, true); document.addEventListener("dblclick", dbl);
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", away); const hide = () => setMenu(null); addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("click", click, true); document.removeEventListener("contextmenu", context, true); document.removeEventListener("dblclick", dbl);
      document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", away); removeEventListener("scroll", hide);
    };
  }, []);
  if (!menu) return null;
  const left = Math.max(8, Math.min(menu.x - 20, innerWidth - 232)), top = Math.max(8, Math.min(menu.y + 16, innerHeight - 200));
  const copy = async () => { await navigator.clipboard.writeText(menu.href); haptic("ok"); toast("Link copied"); setMenu(null); };
  const share = async () => { setMenu(null); try { await navigator.share({ title: menu.title, url: menu.href }); } catch { /* closed */ } };
  return (
    <div className="account-menu quick-menu" role="menu" aria-label={menu.title} style={{ left, top }}>
      <p className="subtle">{menu.title}</p>
      <a role="menuitem" href={menu.href} onClick={() => setMenu(null)}><ArrowUpRight size={15} strokeWidth={1.75} aria-hidden /> Open</a>
      <a role="menuitem" href={menu.href} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}><ExternalLink size={15} strokeWidth={1.75} aria-hidden /> Open in a new tab</a>
      <button role="menuitem" onClick={copy}><Copy size={15} strokeWidth={1.75} aria-hidden /> Copy link</button>
      {"share" in navigator && <button role="menuitem" onClick={share}><Share2 size={15} strokeWidth={1.75} aria-hidden /> Share…</button>}
    </div>
  );
}
