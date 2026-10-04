// 04-10-2026: Omkar asked for a kanban board "relevant" to the app. Each matter is a card she moves between
// stages of her own work; she can add her own task cards too. The board is her work product, never the record:
// it stores only matter ids, column order and the text she typed. Saved per person like the activity trail.

export type Task = { title: string; at: string };
export type Col = { id: string; title: string; cards: string[] };  // card ids: "m:<matter id>" or "t:<task id>"
export type Board = { cols: Col[]; tasks: Record<string, Task> };

export const DEFAULT_COLS: Col[] = [
  { id: "read", title: "To read", cards: [] },
  { id: "work", title: "Working on", cards: [] },
  { id: "ready", title: "Ready for hearing", cards: [] },
  { id: "parked", title: "Parked", cards: [] },
];

/** Keeps the saved board in step with the matters she can see: new matters land in the first column,
 *  matters she no longer has (or archived) drop out, tasks without a card are forgotten. */
export function reconcile(saved: Board | null, matterIds: string[]): Board {
  const cols = (saved?.cols?.length ? saved.cols : DEFAULT_COLS).map((c) => ({ ...c, cards: [...c.cards] }));
  const tasks = { ...(saved?.tasks ?? {}) };
  const have = new Set(matterIds.map((id) => `m:${id}`));
  const seen = new Set<string>();
  for (const c of cols) c.cards = c.cards.filter((id) => !seen.has(id) && (id.startsWith("t:") ? !!tasks[id.slice(2)] : have.has(id)) && seen.add(id));
  cols[0].cards.push(...[...have].filter((id) => !seen.has(id)));
  for (const k of Object.keys(tasks)) if (!seen.has(`t:${k}`)) delete tasks[k];
  return { cols, tasks };
}

/** Moves a card to a column at an index (the end when the index is past it). Pure: returns a new board. */
export function moveCard(b: Board, card: string, toCol: string, index: number): Board {
  const cols = b.cols.map((c) => ({ ...c, cards: c.cards.filter((x) => x !== card) }));
  const to = cols.find((c) => c.id === toCol);
  if (!to) return b;
  to.cards.splice(Math.max(0, Math.min(index, to.cards.length)), 0, card);
  return { ...b, cols };
}
