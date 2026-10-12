import type { SupabaseClient } from "@supabase/supabase-js";
import { fileUrls, type Matter } from "@/lib/data";
import { readInk } from "@/lib/ink";
import type { Note } from "@/app/m/[matter]/d/[doc]/Transcript";

type Section = { title?: string; mark?: string; pageStart?: number; level?: number };
export type Row = { title: string; page: number; level: number };
export type Bundle = {
  scans: string[]; words: string[]; notes: Note[]; outline: Row[];
  hands: Record<string, string>;  // note id -> picture of her handwriting (LiquidText canvas ink)
  ink: { page: number; color: string | null; rects: number[][] }[];
};

// One paper's pages, word layers, highlights, notes and outline for the Workspace. 13-10-2026: the Workspace became one
// continuous scroll of every paper, so each paper is loaded as it scrolls near rather than all at once.
export async function docBundle(supabase: SupabaseClient, m: Matter, id: string): Promise<Bundle | null> {
  const { data: d } = await supabase.from("documents").select("id, page_count, sections").eq("id", id).eq("matter_id", m.id).maybeSingle();
  if (!d) return null;
  const [{ data: pages }, { data: notes }, ink] = await Promise.all([
    supabase.from("document_pages").select("page_no, jpeg_path").eq("doc_id", d.id).order("page_no"),
    supabase.from("annotations").select("id, page_no, char_start, char_end, quote, body, tags, created_at").eq("doc_id", d.id).order("page_no").order("created_at"),
    readInk(m.id, d.id),
  ]);
  const byNo = new Map((pages ?? []).map((p) => [p.page_no, p.jpeg_path]));
  const paths = Array.from({ length: d.page_count }, (_, i) => byNo.get(i + 1) ?? `pages/${d.id}/page-${String(i + 1).padStart(3, "0")}.jpg`);
  const [scans, words] = await Promise.all([
    fileUrls(supabase, m, paths),
    // missing for pages typed in by hand or never read: those pages just have no text layer
    fileUrls(supabase, m, paths.map((p) => p.replace(/page-(\d+)\.jpg$/, "words-$1.json"))),
  ]);
  const inked = (notes ?? []).filter((n) => n.tags?.includes("handwriting"));
  const pics = await fileUrls(supabase, m, inked.map((n) => `${m.id}/pages/${d.id}/hand-${n.id}.png`));
  return {
    scans, words, notes: (notes ?? []) as Note[], hands: Object.fromEntries(inked.map((n, i) => [n.id, pics[i]])),
    ink: ink.map(({ page, color, rects }) => ({ page, color, rects })),
    outline: ((d.sections ?? []) as Section[]).filter((s) => s.pageStart).map((s) => ({
      title: (s.title ?? "").replace(/^#+\s*/, "").trim() || s.mark || "Opening pages", page: s.pageStart!, level: s.level ?? 0,
    })),
  };
}
