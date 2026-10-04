"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/components/Toast";
import type { Job } from "@/lib/jobs";

// Says "ready" for explainers, briefs, reading orders, comparisons and dates, in whichever window and on
// whichever page the person is, and whoever started them. The server keeps working after the browser
// leaves (app/api/study); this only watches. A matter is watched while this page is on it and for ten
// minutes after this browser started something in it. Each finished job is announced once per browser.
const WORDS: Record<string, [string, string]> = {
  explainer: ["explainer", "/explainer"], brief: ["hearing brief", "/brief"], reading: ["reading order", "/reading"], compare: ["comparison", "/compare"], dates: ["list of dates", "/chronology/papers"],
};
const KEY = "cc-watch", TOLD = "cc-told";
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

/** RunStudy calls this when it starts something, so the watcher follows it to other pages and reloads. */
export function watchMatter(matter: string) {
  write(KEY, { ...read<Record<string, number>>(KEY, {}), [matter]: Date.now() });
  dispatchEvent(new Event("cc-watch"));
}

export default function JobWatcher() {
  const path = usePathname(), router = useRouter();
  const here = path.match(/^\/m\/([^/]+)/)?.[1];
  useEffect(() => {
    let dead = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const recent = Object.entries(read<Record<string, number>>(KEY, {})).filter(([, t]) => Date.now() - t < 10 * 60_000).map(([m]) => m);
      const told = new Set(read<string[]>(TOLD, []));
      let running = false;
      for (const matter of new Set([here, ...recent].filter(Boolean) as string[])) {
        const jobs: Job[] = await fetch(`/api/study/jobs?matter=${encodeURIComponent(matter)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        for (const j of jobs) {
          if (j.status === "running") { running = true; continue; }
          const id = `${j.id}:${j.status}`;
          if (told.has(id) || Date.now() - Date.parse(j.finished ?? j.touched) > 15 * 60_000) continue;
          told.add(id);
          const [word, tail] = WORDS[j.kind] ?? [j.kind, ""];
          toast(j.status === "done" ? `The ${word} is ready: ${j.title}` : `The ${word} did not finish: ${j.error ?? "try again"}`, { tone: j.status === "done" ? "ok" : "error", href: j.status === "done" ? `/m/${matter}${tail}` : undefined });
          if (matter === here) router.refresh();
        }
      }
      write(TOLD, [...told].slice(-60));
      if (!dead) timer = setTimeout(tick, running ? 3000 : here ? 20000 : 15000);
    };
    tick();
    const kick = () => { clearTimeout(timer); tick(); };
    addEventListener("cc-watch", kick);
    return () => { dead = true; clearTimeout(timer); removeEventListener("cc-watch", kick); };
  }, [here, router]);
  return null;
}
