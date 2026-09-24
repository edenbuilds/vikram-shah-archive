import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Stage } from "./taxonomies";

export type Matter = {
  id: string; title: string; short: string | null; kind: string; forum: string | null; venue: string | null;
  cause: string | null; posture: string | null; disclaimer: string; stages: Stage[]; storage_base: string | null;
};

// Cached per request: the matter layout and its page both need it.
export const getMatter = cache(async (db: SupabaseClient, id: string): Promise<Matter> => {
  const { data } = await db.from("matters").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data as Matter;
});

// Uploaded files live in the private bucket under "{matter}/..." and get short-lived
// signed URLs (storage RLS checks membership). Anything else is the archive's public
// bucket. Decided per file, so uploads into the archive matter work too.
export async function fileUrls(db: SupabaseClient, m: Matter, paths: string[]): Promise<string[]> {
  const priv = paths.filter((p) => p && (p.startsWith(`${m.id}/`) || !m.storage_base));
  const { data } = priv.length ? await db.storage.from("companion").createSignedUrls(priv, 3600) : { data: [] };
  const signed = new Map((data ?? []).map((d) => [d.path, d.signedUrl ?? ""]));
  return paths.map((p) => (!p ? "" : signed.get(p) ?? `${m.storage_base}/${p}`));
}

export const pages = (a: number, b: number) => (a === b ? `p. ${a}` : `pp. ${a}-${b}`);

export const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

// ponytail: stage-title heuristic for "applications" in the prep brief; add an explicit flag on stages if it misfires.
export const isApplicationStage = (s: Stage) => /application|interim|jurisdiction|s\.1[67]|o\.39/i.test(s.title);

/** DD-MM-YYYY for an ISO date, and for a timestamp in India time. */
export const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
export const dmyIST = (ts: string) => new Date(ts).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
