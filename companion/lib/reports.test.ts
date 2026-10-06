import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMail, buildPrompt, clean, ist, parseUA, redact, routeOf, subjectOf, type Report } from "./reports.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";

const report = (over: Partial<Report["ctx"]> = {}, note = "The Save button is cut off"): Report => ({
  id: "CC-A1B2C3", at: "2026-10-06T09:15:00.000Z", by: "arya@example.com", kind: "visual", note, shot: null, mail: "queued", fixed: null,
  ctx: { ...clean({ ctx: { url: "https://case-companion.edenbuilds.me/m/shah-v-trindade/d/abc", title: "Paper", how: "double", viewport: { w: 390, h: 844, dpr: 3 }, ua: IPHONE, touch: true, touchPoints: 5,
    target: { tag: "button", label: "Save", text: "Save", selector: "form > button.btn", rect: [20, 700, 80, 44], crumbs: ["Paper", "Notes"] } } }).ctx, ...over },
});

test("a sign-in link, an MCP link and a bearer token never reach the report", () => {
  const t = redact("open /k/abc.def123 and /api/mcp/QWxpY2U.aGVsbG8gd29ybGQgdGhpcyBpcyBsb25n then Bearer sk-live-1234567890abcdef and ?token=zzz&x=1");
  assert.ok(!/abc\.def123|QWxpY2U|sk-live|zzz/.test(t), t);
  assert.match(t, /\/k\/\[redacted\]/);
});

test("a matter slug and a paper id survive redaction", () => {
  assert.equal(redact("/m/lade-v-state-wp-1575-2026/d/8f2a1c3e-aaaa-bbbb-cccc-123456789012"), "/m/lade-v-state-wp-1575-2026/d/8f2a1c3e-aaaa-bbbb-cccc-123456789012");
});

test("a report with junk fields is clamped and classified as other", () => {
  const c = clean({ kind: "nonsense", note: "x".repeat(5000), ctx: { viewport: { w: "abc" }, errors: Array(20).fill("e"), target: { rect: [1, 2, 3, 4, 5, 6] } } as never });
  assert.equal(c.kind, "other");
  assert.equal(c.note.length, 2000);
  assert.equal(c.ctx.errors.length, 8);
  assert.equal(c.ctx.viewport.w, 0);
  assert.equal(c.ctx.target?.rect.length, 4);
});

test("user agents map to the device, system and browser a fixer needs", () => {
  assert.deepEqual(parseUA(IPHONE), { browser: "Safari 18.1", os: "iOS 18.1", device: "iPhone" });
  assert.deepEqual(parseUA(IPAD_DESKTOP, 5), { browser: "Safari 17.5", os: "iPadOS", device: "iPad" });
  assert.equal(parseUA(IPAD_DESKTOP, 0).device, "computer");
  assert.deepEqual(parseUA(PIXEL), { browser: "Chrome 129.0.0.0", os: "Android 14", device: "Android phone" });
  assert.equal(parseUA(WIN_EDGE).browser, "Edge 129.0.0.0");
  assert.equal(parseUA(WIN_EDGE).os, "Windows");
});

test("a page maps to its name and the files to start in", () => {
  assert.equal(routeOf("https://x.test/m/shah/d/abc?p=3").name, "Paper reader");
  assert.ok(routeOf("/m/shah/d/abc").files.includes("app/m/[matter]/d/[doc]/page.tsx"));
  assert.equal(routeOf("/settings#reports").name, "Settings");
  assert.equal(routeOf("/nope").name, "Unknown page");
});

test("times are DD-MM-YYYY in India", () => {
  assert.equal(ist("2026-10-06T20:00:00.000Z"), "07-10-2026 01:30 IST");
});

test("the brief carries her words, the page, the element, the device and the steps", () => {
  const p = buildPrompt(report(), "https://case-companion.edenbuilds.me");
  for (const must of ["CC-A1B2C3", "The Save button is cut off", "Paper reader", "app/m/[matter]/d/[doc]/page.tsx", "button.btn", "iPhone, iOS 18.1, Safari 18.1, 390 x 844 at 3x, touch", "Reproduce it first", "06-10-2026 14:45 IST"]) assert.ok(p.includes(must), must);
  assert.ok(!p.includes("—"), "no em dash");
});

test("a report with nothing typed still says so, and a functional one asks for the route first", () => {
  const p = buildPrompt({ ...report({}, ""), kind: "function" }, "https://x.test");
  assert.match(p, /nothing typed/);
  assert.match(p, /server action or route/);
});

test("the mail escapes her words and names the problem in the subject", () => {
  const r = report({}, "<script>alert(1)</script> broken");
  const m = buildMail(r, "https://x.test", true);
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("cid:shot"));
  assert.match(m.subject, /^Case Companion CC-A1B2C3: looks wrong on Paper reader/);
  assert.equal(subjectOf(r).length <= 160, true);
  assert.ok(!buildMail(r, "https://x.test", false).html.includes("cid:shot"));
});
