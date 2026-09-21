import { test } from "node:test";
import assert from "node:assert/strict";
import { facts } from "./facts.ts";

test("dates, amounts and case numbers come out exactly as printed, with every page they appear on", () => {
  const f = facts([
    { page_no: 1, text: "Order dated 26.12.2025 in Complaint No. CC006000000303054 for Rs. 2,57,14,920.00" },
    { page_no: 3, text: "returnable on 23rd September, 2026 at 11.00 a.m.; see order dated 26.12.2025" },
  ]);
  const get = (t: string) => f.find((x) => x.text === t);
  assert.deepEqual(get("26.12.2025")?.pages, [1, 3]);
  assert.equal(get("23rd September, 2026")?.kind, "date");
  assert.equal(get("Rs. 2,57,14,920.00")?.kind, "amount");
  assert.equal(get("Complaint No. CC006000000303054")?.kind, "ref");
  assert.equal(f.some((x) => x.text.includes("11.00")), false);
});
