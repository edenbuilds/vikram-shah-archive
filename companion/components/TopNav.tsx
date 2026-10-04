"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bookmark, FolderOpen, LogOut, Search, Settings2 } from "lucide-react";
import AskButton from "@/app/AskButton";

// 04-10-2026: Omkar asked for a better nav bar, after the React Bits portfolio template's floating pill
// nav. One pill with a sliding highlight; on a phone it floats at the bottom where the thumb is, and the
// top bar keeps only the brand, Ask and her menu. Same day: "too bouncy, it should be animated". The pill used
// to chase the mouse across the links, so it lurched on every pass; it now rests on the current page and
// glides to the next one when the page changes, with a soft wash under the hovered link instead.
// Each section owns a colour (--tone) so the bar is not all violet.
const LINKS = [
  ["/", "Workspace", FolderOpen, "#0007cb"],
  ["/search", "Search", Search, "#0e7490"],
  ["/pins", "Pinned", Bookmark, "#b45309"],
  ["/settings", "Settings", Settings2, "#9d174d"],
] as const;

export default function TopNav({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  const path = usePathname();
  const on = (href: string) => (href === "/" ? path === "/" || path.startsWith("/m/") : path.startsWith(href));
  const bar = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const target = LINKS.find(([h]) => on(h))?.[0] ?? null;

  useLayoutEffect(() => {
    const place = () => {
      const a = bar.current?.querySelector<HTMLElement>(`a[data-href="${target}"]`);
      setPill(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [target]);

  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {  // the menu closes on navigation, an outside tap and Escape
    if (menu.current) menu.current.open = false;
    const close = (e: Event) => { if (menu.current && !(e instanceof KeyboardEvent ? e.key !== "Escape" : menu.current.contains(e.target as Node))) menu.current.open = false; };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [path]);

  const initial = (email[0] ?? "?").toUpperCase();
  return (
    <header className="top">
      <Link href="/" className="brand" aria-label="Case Companion, workspace">
        <span className="brand-mark" aria-hidden>CC</span>
        <span><b>Case Companion</b></span>
      </Link>
      <nav ref={bar} className="pillnav" aria-label="Main">
        {pill && <span className="pillnav-pill" aria-hidden style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
        {LINKS.map(([href, label, Icon, tone]) => (
          <Link key={href} href={href} data-href={href} aria-current={on(href) ? "page" : undefined} style={{ "--tone": tone } as React.CSSProperties}>
            <Icon size={16} strokeWidth={1.75} aria-hidden /><span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="top-actions">
        <AskButton />
        <details ref={menu} className="account">
          <summary aria-label="Your account"><span className="avatar">{initial}</span></summary>
          <div className="account-menu" role="menu">
            <p className="subtle">Signed in as<br /><b>{email}</b></p>
            <Link href="/settings" role="menuitem"><Settings2 size={15} strokeWidth={1.75} aria-hidden /> Settings</Link>
            <form action={signOut}><button role="menuitem"><LogOut size={15} strokeWidth={1.75} aria-hidden /> Sign out</button></form>
          </div>
        </details>
      </div>
    </header>
  );
}
