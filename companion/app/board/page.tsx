import Link from "next/link";
import { requireUser } from "@/lib/supabase";
import { getPrefs } from "@/lib/prefs";
import { loadBoard } from "@/lib/board-store";
import { KanbanBoard, type MatterCard } from "@/components/ui/kanban-board";
import { saveBoard } from "./actions";

export const metadata = { title: "Board" };

export default async function BoardPage() {
  const { supabase, user } = await requireUser();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const week = new Date(Date.parse(today + "T00:00:00Z") + 7 * 864e5).toISOString().slice(0, 10);
  const [{ data: matters }, { data: docs }, { data: notes }, { data: hearings }, prefs] = await Promise.all([
    supabase.from("matters").select("id, title, kind").order("created_at"),
    supabase.from("documents").select("matter_id"),
    supabase.from("annotations").select("matter_id"),
    supabase.from("hearings").select("matter_id, date").eq("status", "upcoming").gte("date", today).order("date"),
    getPrefs(user.email!),
  ]);
  const live = (matters ?? []).filter((m) => !prefs.archived.includes(m.id));
  const cards: Record<string, MatterCard> = Object.fromEntries(live.map((m) => {
    const next = (hearings ?? []).find((h) => h.matter_id === m.id)?.date ?? null;
    return [m.id, { id: m.id, title: m.title, kind: m.kind, next, soon: !!next && next <= week,
      papers: (docs ?? []).filter((d) => d.matter_id === m.id).length, notes: (notes ?? []).filter((n) => n.matter_id === m.id).length }];
  }));
  const board = await loadBoard(user.email!, live.map((m) => m.id));
  return (
    <main className="wrap-wide stack" style={{ gap: "1.25rem" }}>
      <div className="hero view-head">
        <h1>Your matters</h1>
        <nav className="view-switch" aria-label="View"><Link href="/">List</Link><Link href="/board" aria-current="page">Board</Link></nav>
      </div>
      <p className="muted lede-sm">Drag a matter to where your work on it stands. On a keyboard: focus a card, press space, move with the arrows, press space again.</p>
      <KanbanBoard initial={board} matters={cards} save={saveBoard} />
    </main>
  );
}
