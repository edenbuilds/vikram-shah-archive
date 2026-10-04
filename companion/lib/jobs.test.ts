import test from "node:test";
import assert from "node:assert/strict";
import { jobKind, settle, type Job } from "./jobs.ts";

const job = (o: Partial<Job> = {}): Job => ({ id: "a", matter: "m", title: "T", kind: "explainer", by: "x@y", at: "2026-10-04T10:00:00Z", touched: "2026-10-04T10:00:00Z", status: "running", ...o });

test("a run that stopped writing for six minutes is shown as stopped, not running forever", () => {
  assert.equal(settle(job(), Date.parse("2026-10-04T10:07:00Z")).status, "error");
  assert.equal(settle(job(), Date.parse("2026-10-04T10:03:00Z")).status, "running");
});
test("a finished run is left as it is however old it is", () => {
  assert.equal(settle(job({ status: "done" }), Date.parse("2026-10-05T10:00:00Z")).status, "done");
});
test("the reading order has one job whether one paper or all of them were asked for, and keep requests make none", () => {
  assert.equal(jobKind("reading-all"), "reading");
  assert.equal(jobKind("explainer"), "explainer");
  assert.equal(jobKind("keep-explainer"), null);
});
