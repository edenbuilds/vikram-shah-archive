import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, type Chunk } from "./citations.ts";

const chunks: Chunk[] = [
  { id: 1, doc_id: "soc", page_start: 4, page_end: 4, text: "The Claimant paid a sum of Rs. 3,67,60,000/- (Rupees Three Crores\nSixty Seven Lakhs Sixty Thousand only) on 12.03.2013." },
  { id: 2, doc_id: "order", page_start: 2, page_end: 2, text: "The matter is adjourned to 14.08.2026 for arguments on the s.16 application." },
];

test("keeps a claim whose quote is a verbatim span and whose figures are quoted", () => {
  const v = verify({ status: "answered", claims: [{ text: "The Claimant says he paid Rs. 3,67,60,000/- on 12.03.2013.",
    citations: [{ chunk_id: 1, quote: "paid a sum of Rs. 3,67,60,000/- (Rupees Three Crores Sixty Seven Lakhs Sixty Thousand only) on 12.03.2013" }] }] }, chunks);
  assert.equal(v.status, "answered");
  assert.equal(v.claims.length, 1);
  assert.deepEqual([v.claims[0].citations[0].doc_id, v.claims[0].citations[0].page_start], ["soc", 4]);
});

test("rejects a paraphrased (non-verbatim) quote", () => {
  const v = verify({ status: "answered", claims: [{ text: "Arguments were fixed.", citations: [{ chunk_id: 2, quote: "hearing fixed for arguments" }] }] }, chunks);
  assert.equal(v.status, "not_in_corpus");
  assert.equal(v.rejected.length, 1);
});

test("rejects a figure that is not in the quoted source", () => {
  const v = verify({ status: "answered", claims: [{ text: "Adjourned to 15.08.2026.",
    citations: [{ chunk_id: 2, quote: "The matter is adjourned to 14.08.2026" }] }] }, chunks);
  assert.equal(v.status, "not_in_corpus");
  assert.match(v.rejected[0].reason, /15\.08\.2026/);
});

test("rejects citations to chunks the model was not shown", () => {
  const v = verify({ status: "answered", claims: [{ text: "Something.", citations: [{ chunk_id: 99, quote: "The matter is adjourned" }] }] }, chunks);
  assert.equal(v.status, "not_in_corpus");
});

test("not_in_corpus from the model stays not_in_corpus", () => {
  assert.equal(verify({ status: "not_in_corpus", claims: [] }, chunks).status, "not_in_corpus");
});
