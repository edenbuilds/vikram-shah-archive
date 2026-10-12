import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeTable, tableText, type Word } from "./layout.ts";

// Vision handed the index back column by column (CC-80741E); the rows must come back as rows.
const cell = (x: number, y: number, t: string): Word => [x, y, x + t.length * 0.012, y + 0.012, t];
const index: Word[] = [
  ...["Sr.", "1.", "2.", "3.", "4.", "5."].map((t, i) => cell(0.1, 0.2 + i * 0.03, t)),
  ...["Particulars", "Synopsis", "Writ", "Vakalatnama", "Memorandum", "List"].map((t, i) => cell(0.2, 0.2 + i * 0.03, t)),
  ...["Exh.", "A", "B", "C", "D", "E"].map((t, i) => cell(0.55, 0.2 + i * 0.03, t)),
  ...["Pages", "1", "27", "34", "35", "37"].map((t, i) => cell(0.8, 0.2 + i * 0.03, t)),
];

test("a table page read cell by cell comes back with each row on one line", () => {
  assert.ok(looksLikeTable(index));
  const lines = tableText(index).split("\n").map((l) => l.trim().split(/\s{3,}/));
  assert.deepEqual(lines[2], ["2.", "Writ", "B", "27"]);
  assert.deepEqual(lines[0], ["Sr.", "Particulars", "Exh.", "Pages"]);
});

test("ordinary prose is not taken for a table", () => {
  const line = (y: number) => { let x = 0.1; return ["The", "petitioner", "states", "that"].map((t) => { const w = cell(x, y, t); x = w[2] + 0.008; return w; }); };
  const prose = Array.from({ length: 8 }, (_, i) => line(0.2 + i * 0.03)).flat();
  assert.equal(looksLikeTable(prose), false);
});
