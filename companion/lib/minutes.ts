// Drafts structured minutes from the advocate's own raw hearing notes. Each item must
// carry a verbatim source_quote from those notes; unpinned items are dropped, not shown.
import { jsonChat } from "./ai.ts";
import { isSpan, unsupportedFigures } from "./citations.ts";

export type Item = { text: string; source_quote: string };
export type Minutes = { attendees: Item[]; orders: Item[]; next_date: (Item & { iso: string | null }) | null; action_items: Item[] };
export type Drafted = { draft: Minutes; dropped: { field: string; text: string }[] };

const item = {
  type: "object",
  additionalProperties: false,
  required: ["text", "source_quote"],
  properties: { text: { type: "string" }, source_quote: { type: "string" } },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["attendees", "orders", "next_date", "action_items"],
  properties: {
    attendees: { type: "array", items: item },
    orders: { type: "array", items: item },
    next_date: {
      anyOf: [
        { type: "null" },
        { ...item, required: ["text", "source_quote", "iso"], properties: { ...item.properties, iso: { type: ["string", "null"] } } },
      ],
    },
    action_items: { type: "array", items: item },
  },
};

const SYSTEM = `You turn an advocate's raw hearing notes into draft "Minutes of Proceedings" fields.
Use ONLY what the notes say. Each item needs "source_quote": a contiguous span copied character-for-character from the notes.
attendees: who appeared (as written). orders: what the forum directed or passed (as written). next_date: the next date if the notes give one, with iso YYYY-MM-DD only if the full date is written, else null. action_items: tasks the notes assign.
Do not add anything the notes don't state. If a field has nothing, return an empty list (or null for next_date).`;

export async function draftMinutes(raw: string): Promise<Drafted> {
  const out = await jsonChat<Minutes>(SYSTEM, raw, "minutes_draft", SCHEMA);
  return checkMinutes(out, raw);
}

export function checkMinutes(out: Minutes, raw: string): Drafted {
  const dropped: Drafted["dropped"] = [];
  const ok = (field: string) => (i: Item) => {
    const good = isSpan(i.source_quote, raw, 3) && !unsupportedFigures(i.text, i.source_quote).length;
    if (!good) dropped.push({ field, text: i.text });
    return good;
  };
  const nd = out.next_date && ok("next_date")(out.next_date) ? out.next_date : null;
  return {
    draft: {
      attendees: out.attendees.filter(ok("attendees")),
      orders: out.orders.filter(ok("orders")),
      next_date: nd && nd.iso && !/^\d{4}-\d{2}-\d{2}$/.test(nd.iso) ? { ...nd, iso: null } : nd,
      action_items: out.action_items.filter(ok("action_items")),
    },
    dropped,
  };
}
