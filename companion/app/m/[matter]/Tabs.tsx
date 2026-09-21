"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "Papers"],
  ["/map", "Map"],
  ["/chronology", "Chronology"],
  ["/hearings", "Hearings"],
  ["/collections", "Collections"],
  ["/upload", "Upload"],
] as const;

export default function Tabs({ base }: { base: string }) {
  const path = usePathname();
  const active = (suffix: string) => (suffix ? path.startsWith(base + suffix) : path === base || path.startsWith(`${base}/d/`));
  return (
    <nav className="tabs" aria-label="Matter">
      {TABS.map(([suffix, label]) => (
        <Link key={label} href={base + suffix} aria-current={active(suffix) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
