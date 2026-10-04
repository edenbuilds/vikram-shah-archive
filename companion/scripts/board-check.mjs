// Live board check: mouse drag, keyboard move, iPad touch drag, add and remove a task, each confirmed after a reload.
//   node scripts/board-check.mjs <base> <signin-link>
import { chromium } from "playwright";
const [base, link] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });  // system Chrome: touch through CDP needs Chromium
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
const colOf = (p, title) => p.evaluate((t) => [...document.querySelectorAll(".kb-col")].findIndex((c) => [...c.querySelectorAll(".kb-title")].some((x) => x.textContent === t)), title);
const box = async (loc) => { await loc.scrollIntoViewIfNeeded(); return loc.boundingBox(); };
const rect = (loc) => loc.boundingBox();  // targets are measured without scrolling: scrolling a 2000px column would make the source coordinates stale
const settle = async (p) => { await p.waitForTimeout(1500); await p.reload({ waitUntil: "networkidle" }); };

// desktop: mouse + keyboard
let ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); ctx.setDefaultTimeout(30000); let p = await ctx.newPage();  // a busy machine makes "stable" waits slow
await p.goto(link, { waitUntil: "networkidle" }); await p.goto(base + "/board", { waitUntil: "networkidle" });
const cols = p.locator(".kb-col");
ok(await cols.count() === 4, "four columns render");
const card = cols.nth(0).locator(".kb-card").first();
const title = await card.locator(".kb-title").textContent();
let s = await box(card), t = await rect(cols.nth(2).locator(".kb-list"));
await p.mouse.move(s.x + 20, s.y + 20); await p.mouse.down();
for (let i = 1; i <= 15; i++) await p.mouse.move(s.x + 20 + (t.x + 40 - s.x - 20) * i / 15, s.y + 20 + (t.y + 30 - s.y - 20) * i / 15);
await p.mouse.up();
ok(await p.getByText("Moved to Ready for hearing").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "mouse drag shows the toast");  // isVisible({timeout}) ignores its timeout
await settle(p); ok(await colOf(p, title) === 2, "mouse drag survives a reload");
ok(p.url().endsWith("/board"), "dropping did not open the matter");

const kc = p.locator(".kb-card", { has: p.locator(".kb-title", { hasText: title }) });
await kc.focus(); await p.keyboard.press("Space"); await p.locator(".is-lifted").waitFor(); await p.waitForTimeout(400);  // dnd-kit starts listening for arrows a tick after the lift
await p.keyboard.press("ArrowLeft"); await p.getByText(/is over Working on/).first().waitFor({ timeout: 10000 }).catch(() => {}); await p.keyboard.press("Space");
await p.getByText("Moved to Working on").first().waitFor({ timeout: 15000 }).catch(() => {});  // reload only after the save is confirmed
await settle(p); ok(await colOf(p, title) === 1, "keyboard move (space, left arrow, space) lands in Working on");

const parked = p.locator(".kb-col").nth(3);
await parked.getByRole("button", { name: "Add a task" }).click();
await p.keyboard.type("zz board check task"); await p.keyboard.press("Enter");
await settle(p); ok(await p.locator(".kb-title", { hasText: "zz board check task" }).count() === 1, "added task survives a reload");
const hold = p.locator(".kb-card", { has: p.getByText("zz board check task") }).getByRole("button");
const hb = await box(hold); await p.mouse.move(hb.x + 10, hb.y + 10); await p.mouse.down(); await p.waitForTimeout(1100); await p.mouse.up();
await settle(p); ok(await p.locator(".kb-title", { hasText: "zz board check task" }).count() === 0, "hold to remove deletes the task");
await ctx.close();

// iPad Pro 13 landscape: real touch events through CDP (press, hold 300 ms, move, release)
ctx = await b.newContext({ viewport: { width: 1376, height: 1032 }, hasTouch: true, isMobile: true }); ctx.setDefaultTimeout(30000); p = await ctx.newPage();
await p.goto(link, { waitUntil: "networkidle" }); await p.goto(base + "/board", { waitUntil: "networkidle" });
const cdp = await ctx.newCDPSession(p);
const c2 = p.locator(".kb-card", { has: p.locator(".kb-title", { hasText: title }) });
s = await box(c2); t = await rect(p.locator(".kb-col").nth(0).locator(".kb-list"));
const pt = (x, y) => [{ x, y }];
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(s.x + 20, s.y + 12) });
await p.waitForTimeout(320);
for (let i = 1; i <= 20; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(s.x + 20 + (t.x + 40 - s.x - 20) * i / 20, s.y + 12 + (t.y + 20 - s.y - 12) * i / 20) }); await p.waitForTimeout(16); }
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await settle(p); ok(await colOf(p, title) === 0, "iPad touch drag back to To read survives a reload");
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways page scroll on iPad landscape");
await ctx.close(); await b.close();
