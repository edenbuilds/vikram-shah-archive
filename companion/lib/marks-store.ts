import { readState, writeState } from "./access.ts";
import type { PageMarks } from "./marks.ts";

// Kept apart from marks.ts so the reader's browser code can use the labels and types without the storage key.
const file = (doc: string) => `_system/marks/${doc}.json`;
export const getMarks = (doc: string) => readState<Record<string, PageMarks>>(file(doc), {});
// ponytail: one JSON per paper, read-modify-write; two pages read in the same second can drop one. A table if it ever matters.
export async function saveMarks(doc: string, page: number, entry: PageMarks) {
  const all = await getMarks(doc);
  all[page] = entry;
  await writeState(file(doc), all);
}
