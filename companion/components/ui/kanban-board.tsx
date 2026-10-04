"use client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, FileText, GripVertical, NotebookPen, Plus } from "lucide-react";
import HoldButton from "@/components/rb/HoldButton";
import { toast } from "@/components/Toast";
import { moveCard, type Board } from "@/lib/board";

// 04-10-2026: the 21st.dev kanban demo Omkar supplied, ported from Tailwind to this app's plain CSS (globals.css
// "kanban"), and rebuilt on dnd-kit: the demo's native HTML drag does not work with touch on iPad or with a keyboard,
// and "drag drop should be flawless". Kept: columns with counts, cards with tags and a meta footer, inline "add a task",
// empty-column drop hint. Dropped: avatars, cover photos and priorities (invented people and data on a legal product).
// Matter cards carry only real rows: kind, next hearing, papers and her notes.

export type MatterCard = { id: string; title: string; kind: string; next: string | null; soon: boolean; papers: number; notes: number };

const dmy = (iso: string) => iso.split("-").reverse().join("-");
let lastDrop = 0;  // a drag that starts on the title must not also open the matter when it ends

export function KanbanBoard({ initial, matters, save }: { initial: Board; matters: Record<string, MatterCard>; save: (b: Board) => Promise<void> }) {
  const [board, setBoard] = useState(initial);
  const [active, setActive] = useState<string | null>(null);
  const [, start] = useTransition();
  const from = useRef<string | null>(null);
  const snap = useRef(initial);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),  // a short press, so a swipe still scrolls
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colOf = (b: Board, id: string) => b.cols.find((c) => c.id === id || c.cards.includes(id));
  const label = (id: string) => (id.startsWith("m:") ? matters[id.slice(2)]?.title : board.tasks[id.slice(2)]?.title) ?? "card";
  const persist = (next: Board, msg?: string) => start(async () => {
    try { await save(next); if (msg) toast(msg); } catch { toast("Could not save the board. Try again."); }
  });

  const onStart = ({ active }: DragStartEvent) => { snap.current = board; setActive(String(active.id)); from.current = colOf(board, String(active.id))?.id ?? null; };
  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const a = String(active.id), o = String(over.id);
    const ca = colOf(board, a), co = colOf(board, o);
    if (!ca || !co || ca.id === co.id) return;
    const at = co.id === o ? co.cards.length : co.cards.indexOf(o);
    setBoard((b) => moveCard(b, a, co.id, at));
  };
  const onEnd = ({ active, over }: DragEndEvent) => {
    setActive(null); lastDrop = Date.now();
    const a = String(active.id);
    const col = colOf(board, a);
    if (!over || !col) { setBoard(snap.current); return; }
    const o = String(over.id);
    const next = o !== a && col.cards.includes(o) ? moveCard(board, a, col.id, col.cards.indexOf(o)) : board;
    setBoard(next);
    persist(next, from.current !== col.id ? `Moved to ${col.title}` : undefined);
  };

  const addTask = (colId: string, title: string) => {
    const id = crypto.randomUUID().slice(0, 12);
    const next = { ...board, tasks: { ...board.tasks, [id]: { title, at: new Date().toISOString() } }, cols: board.cols.map((c) => (c.id === colId ? { ...c, cards: [...c.cards, `t:${id}`] } : c)) };
    setBoard(next); persist(next, "Task added");
  };
  const removeTask = (card: string) => {
    const tasks = { ...board.tasks }; delete tasks[card.slice(2)];
    const next = { cols: board.cols.map((c) => ({ ...c, cards: c.cards.filter((x) => x !== card) })), tasks };
    setBoard(next); persist(next, "Task removed");
  };

  const announcements: Announcements = useMemo(() => ({
    onDragStart: ({ active }) => `Picked up ${label(String(active.id))}.`,
    onDragOver: ({ active, over }) => (over ? `${label(String(active.id))} is over ${colOf(board, String(over.id))?.title ?? "a column"}.` : ""),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${label(String(active.id))} in ${colOf(board, String(over.id))?.title ?? "the column"}.` : "Move cancelled."),
    onDragCancel: ({ active }) => `Move cancelled. ${label(String(active.id))} is back where it was.`,
  }), [board]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd}
      onDragCancel={() => { setActive(null); setBoard(snap.current); }}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "To move a card, press space or enter, use the arrow keys, then press space or enter again to drop it. Escape cancels." } }}>
      <div className="kb" role="list" aria-label="Board">
        {board.cols.map((c) => (
          <Column key={c.id} id={c.id} title={c.title} cards={c.cards} onAdd={(t) => addTask(c.id, t)}>
            {c.cards.map((id) => (
              <Sortable key={id} id={id}>
                <Card id={id} m={matters[id.slice(2)]} task={board.tasks[id.slice(2)]} onRemove={() => removeTask(id)} />
              </Sortable>
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.16,1,.3,1)" }}>
        {active && <div className="kb-card is-lifted"><Card id={active} m={matters[active.slice(2)]} task={board.tasks[active.slice(2)]} /></div>}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ id, title, cards, onAdd, children }: { id: string; title: string; cards: string[]; onAdd: (t: string) => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const submit = () => { if (text.trim()) onAdd(text.trim()); setText(""); setAdding(false); };
  return (
    <section className={`kb-col${isOver ? " is-over" : ""}`} role="listitem" aria-labelledby={`kb-h-${id}`}>
      <header className="kb-head"><h2 id={`kb-h-${id}`}>{title}</h2><span className="kb-count" aria-label={`${cards.length} cards`}>{cards.length}</span></header>
      <SortableContext id={id} items={cards} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="kb-list">
          {children}
          {!cards.length && <p className="kb-empty">Drop a card here</p>}
        </div>
      </SortableContext>
      {adding ? (
        <input className="kb-input" autoFocus placeholder="What needs doing?" aria-label={`New task in ${title}`} value={text} maxLength={200}
          onChange={(e) => setText(e.target.value)} onBlur={submit}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setText(""); setAdding(false); } }} />
      ) : (
        <button type="button" className="kb-add" onClick={() => setAdding(true)}><Plus size={15} aria-hidden /> Add a task</button>
      )}
    </section>
  );
}

function Sortable({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} className={`kb-card${isDragging ? " is-ghost" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function Card({ id, m, task, onRemove }: { id: string; m?: MatterCard; task?: { title: string; at: string }; onRemove?: () => void }) {
  const stop = { onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(), onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation() };
  if (id.startsWith("t:")) return (
    <div className="kb-in">
      <span className="kb-tag task">Your task</span>
      <p className="kb-title">{task?.title}</p>
      {onRemove && <div className="kb-foot" {...stop}><HoldButton size="sm" holdTime={600} onHold={onRemove}>Hold to remove</HoldButton></div>}
    </div>
  );
  if (!m) return null;
  return (
    <div className="kb-in">
      <div className="kb-row"><span className="pill seal kind" data-kind={m.kind}>{m.kind}</span><GripVertical size={15} className="kb-grip" aria-hidden /></div>
      <Link href={`/m/${m.id}`} className="kb-title" onClick={(e) => { if (Date.now() - lastDrop < 300) e.preventDefault(); }}>{m.title}</Link>
      <div className="kb-meta">
        <span className={m.soon ? "kb-soon" : undefined}><CalendarDays size={14} aria-hidden />{m.next ? dmy(m.next) : "No hearing set"}</span>
        <span><FileText size={14} aria-hidden />{m.papers}</span>
        {m.notes > 0 && <span className="kb-notes"><NotebookPen size={14} aria-hidden />{m.notes}</span>}
      </div>
    </div>
  );
}
