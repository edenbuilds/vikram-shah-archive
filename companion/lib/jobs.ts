import { readState, writeState } from "./access.ts";

// 04-10-2026: Omkar: "if I create a summary or explainer once it should save on its own, whoever creates it,
// even if I go to another task or another window". The save itself is the server's job (it keeps running
// after the browser leaves); this file is the visible half: one small record per matter and kind saying who
// started it, how far it is and whether it finished, so any window of any member can show it and say when it is ready.

export const KINDS = ["brief", "explainer", "reading", "compare", "dates"] as const;
export type Kind = (typeof KINDS)[number];
export type Job = { id: string; matter: string; title: string; kind: Kind; by: string; at: string; touched: string; status: "running" | "done" | "error"; step?: string; finished?: string; error?: string };

const at = (matter: string, kind: string) => `_system/jobs/${matter}.${kind}.json`;
/** "reading-all" is the reading order too; "keep-*" never makes anything. */
export const jobKind = (k: string): Kind | null => { const j = k === "reading-all" ? "reading" : k; return (KINDS as readonly string[]).includes(j) ? (j as Kind) : null; };
export const saveJob = (j: Job) => writeState(at(j.matter, j.kind), j);

/** A run that stopped writing for six minutes died with its function (the limit is five): say so instead of "running" forever. */
export const settle = (j: Job, now = Date.now()): Job =>
  j.status === "running" && now - Date.parse(j.touched) > 6 * 60_000 ? { ...j, status: "error", error: "It stopped before it finished. Start it again." } : j;

export async function getJobs(matter: string): Promise<Job[]> {
  const all = await Promise.all(KINDS.map((k) => readState<Job | null>(at(matter, k), null)));
  return all.filter((j): j is Job => !!j).map((j) => settle(j));
}
