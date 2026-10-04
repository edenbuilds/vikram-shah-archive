"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

const TABS = [
  ["", "Papers"],
  ["/explainer", "Explainer"],
  ["/reading", "Reading order"],
  ["/brief", "Brief"],
  ["/compare", "Compare"],
  ["/chronology", "Chronology"],
  ["/map", "Map"],
  ["/hearings", "Hearings"],
  ["/collections", "Collections"],
  ["/upload", "Upload"],
] as const;

// 04-10-2026: one underline that slides to the active tab (same 250 ms smooth-out as the top nav);
// the active tab is scrolled into view on a phone, and the edge fade shows only while more tabs hide.
export default function Tabs({ base }: { base: string }) {
  const path = usePathname();
  const active = (suffix: string) => (suffix ? path.startsWith(base + suffix) : path === base || path.startsWith(`${base}/d/`));
  const bar = useRef<HTMLElement>(null);
  const [line, setLine] = useState<{ x: number; w: number } | null>(null);
  const [fade, setFade] = useState({ l: false, r: false });

  useLayoutEffect(() => {
    const nav = bar.current!;
    const edges = () => setFade({ l: nav.scrollLeft > 4, r: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4 });
    const place = () => {
      const a = nav.querySelector<HTMLElement>("a[aria-current=page]");
      setLine(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
      edges();
    };
    place();
    nav.querySelector("a[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "center" });
    nav.addEventListener("scroll", edges, { passive: true });
    addEventListener("resize", place);
    return () => { nav.removeEventListener("scroll", edges); removeEventListener("resize", place); };
  }, [path]);

  return (
    <nav ref={bar} className={`tabs${fade.l ? " fade-l" : ""}${fade.r ? " fade-r" : ""}`} aria-label="Matter">
      {line && <span className="tabs-line" aria-hidden style={{ transform: `translateX(${line.x}px)`, width: line.w }} />}
      {TABS.map(([suffix, label]) => (
        <Link key={label} href={base + suffix} aria-current={active(suffix) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
