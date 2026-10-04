"use server";
import { requireUser } from "@/lib/supabase";
import { storeBoard } from "@/lib/board-store";
import { reconcile, type Board } from "@/lib/board";

/** Saves her board; matter ids are re-checked against the matters she can see before writing. */
export async function saveBoard(b: Board) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("matters").select("id");
  const clean = reconcile({
    cols: b.cols.slice(0, 8).map((c) => ({ id: String(c.id), title: String(c.title).slice(0, 40), cards: c.cards.map(String) })),
    tasks: Object.fromEntries(Object.entries(b.tasks ?? {}).slice(0, 200).map(([k, t]) => [k, { title: String(t.title).slice(0, 200), at: String(t.at) }])),
  }, (data ?? []).map((m) => m.id));
  await storeBoard(user.email!, clean);
}
