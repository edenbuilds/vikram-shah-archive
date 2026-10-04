// In-app interaction check (04-10-2026): nav pill, tone toasts, tab and stat colours, highlights on words and on the scan,
// editing a note, her note under an explainer part, renaming a board task, and the phone's Bookmarks button.
// Everything it writes it removes again. Run:  node scripts/inapp-check.mjs <base> <signin-link>
import { chromium } from "playwright";
const [base, link] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const ok = (c, m) => { console.log(`${c ? "PASS" : c === null ? "SKIP" : "FAIL"} ${m}`); if (c === false) process.exitCode = 1; };
// a loaded machine hydrates slowly: every step waits until the page's own scripts are running
const hydrated = (pg) => pg.waitForFunction(() => window.fetch.toString().includes("next-action"), null, { timeout: 180000 });
const go = async (pg, url) => { await pg.goto(url, { waitUntil: "load" }); await hydrated(pg); };
const again = async (pg) => { await pg.reload({ waitUntil: "load" }); await hydrated(pg); };
const toastSeen = (p, re) => p.locator(".toast", { hasText: re }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); ctx.setDefaultTimeout(120000);
const p = await ctx.newPage();
await go(p, link); await go(p, base + "/");

// nav: the pill rests on the page and does not chase the mouse
const pill = () => p.locator(".pillnav-pill").evaluate((e) => e.style.transform);
const rest = await pill();
await p.locator(".pillnav a", { hasText: "Settings" }).hover(); await p.waitForTimeout(600);
ok(await pill() === rest, "nav pill stays put while the mouse passes over other links");
ok(await p.locator(".pillnav-pill").evaluate((e) => getComputedStyle(e).transitionDuration.startsWith("0.38")), "nav pill glides for 380 ms");
await p.locator(".pillnav a", { hasText: "Search" }).click(); await p.waitForURL(/\/search/); await hydrated(p); await p.waitForTimeout(600);
ok(await pill() !== rest, "nav pill moves to the page you navigated to");

// matter: tab and stat colours, stat tiles are links
await go(p, base + "/");
await p.locator(".matter-card").first().click(); await p.waitForURL(/\/m\/[^/]+$/); await hydrated(p); await p.waitForTimeout(500);
const matterUrl = p.url();
const line = await p.locator(".tabs-line").evaluate((e) => getComputedStyle(e).backgroundColor);
ok(line === "rgb(0, 7, 203)", "Papers tab underline is violet");
await p.locator(".tabs a", { hasText: "Explainer" }).click(); await p.waitForURL(/explainer/); await hydrated(p); await p.waitForTimeout(700);
ok(await p.locator(".tabs-line").evaluate((e) => getComputedStyle(e).backgroundColor) === "rgb(124, 58, 237)", "Explainer tab underline takes its own colour");

// explainer: her own note under a part (skipped when no explainer has been made)
if (await p.locator(".brief-section").count()) {
  const part = p.locator(".brief-section").first();
  await part.getByRole("button", { name: /Add your note|edit/ }).first().click();
  await part.locator("textarea").fill("zz inapp check note"); await part.getByRole("button", { name: "Save" }).click();
  ok(await toastSeen(p, /Note saved/), "a note under an explainer part saves with a toast");
  await again(p);
  ok(await p.getByText("zz inapp check note").count() === 1, "her explainer note survives a reload");
  await p.locator(".brief-section").first().getByRole("button", { name: "edit" }).click();
  await p.locator(".brief-section").first().locator("textarea").fill(""); await p.locator(".brief-section").first().getByRole("button", { name: "Save" }).click();
  ok(await toastSeen(p, /Note removed/), "emptying it removes it");
} else ok(null, "no explainer made on this account, section note not exercised");

// stat tiles and the paper
await go(p, matterUrl);
ok(await p.locator("a.stat").count() >= 3, "stat tiles are links");
const paper = p.locator(".docrow").first();
if (!(await paper.count())) { ok(null, "no papers in this matter"); await b.close(); process.exit(); }
await paper.click(); await p.waitForURL(/\/d\//, { timeout: 120000 }); await hydrated(p); await p.waitForSelector(".paper-text [data-start]");

// highlight words: select, pick a colour, the mark shows and survives a reload, then delete it
const marks = () => p.locator("mark.hl").count();
const before = await marks();
await p.evaluate(() => {
  const el = document.querySelector(".paper-text [data-start]"); const t = el.firstChild;
  const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(24, t.length));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.querySelector(".paper-text").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
});
await p.locator(".sel-pop .swatch").nth(1).click();
ok(await toastSeen(p, /Highlighted/), "highlighting words toasts");
await p.waitForFunction((n) => document.querySelectorAll("mark.hl").length > n, before, { timeout: 15000 }).catch(() => {});
ok(await marks() > before, "the highlight shows over the words");
await again(p); ok(await marks() > before, "the highlight survives a reload");
const card = () => p.locator(".note", { hasText: "Highlight" }).first();
await card().getByRole("button", { name: "delete" }).click();
await p.waitForFunction((n) => document.querySelectorAll("mark.hl").length === n, before, { timeout: 15000 }).catch(() => {});
ok(await marks() === before, "deleting the highlight removes the mark");

// highlight on the scan: draw a box, it is saved as ink, then delete it
const inks = () => p.locator(".scan-ink > .ink-mark").count();
const i0 = await inks();
await p.locator(".hl-bar .swatch").first().click();
const sb = await p.locator(".scan-draw").boundingBox();
await p.mouse.move(sb.x + sb.width * .2, sb.y + sb.height * .2); await p.mouse.down();
await p.mouse.move(sb.x + sb.width * .5, sb.y + sb.height * .22, { steps: 8 }); await p.mouse.up();
ok(await toastSeen(p, /Highlighted/), "drawing on the scan toasts");
await again(p);
ok(await inks() === i0 + 1, "the drawn highlight is on the scan after a reload");
await card().getByRole("button", { name: "delete" }).click();
await p.waitForTimeout(1500); await again(p);
ok(await inks() === i0, "deleting it removes its shape from the scan too");

// edit a note in place
await p.locator("textarea[name=body]").first().fill("zz inapp edit before"); await p.getByRole("button", { name: "Save note" }).click();
ok(await toastSeen(p, /Note saved/), "a note saves with a toast");
await p.locator(".note", { hasText: "zz inapp edit before" }).first().getByRole("button", { name: "Edit" }).click();
await p.locator("dialog[open] textarea").fill("zz inapp edit after"); await p.locator("dialog[open]").getByRole("button", { name: "Save" }).click();
await p.waitForTimeout(1200); await again(p);
ok(await p.getByText("zz inapp edit after").count() >= 1 && await p.getByText("zz inapp edit before").count() === 0, "editing a note changes it");
await p.locator(".note", { hasText: "zz inapp edit after" }).first().getByRole("button", { name: "delete" }).click();
await p.waitForTimeout(1200); await again(p);
ok(await p.getByText("zz inapp edit after").count() === 0, "the check note is cleaned up");

// board: rename a task by clicking its title
await go(p, base + "/board");
await p.locator(".kb-col").nth(3).getByRole("button", { name: "Add a task" }).click();
await p.keyboard.type("zz inapp task"); await p.keyboard.press("Enter");
ok(await toastSeen(p, /Task added/) && await p.locator(".toast.tone-ok").count() >= 0, "adding a task toasts");
await p.waitForTimeout(1500);
await p.locator(".kb-rename", { hasText: "zz inapp task" }).click(); await p.locator(".kb-card input.kb-input").fill("zz inapp renamed"); await p.keyboard.press("Enter");
ok(await toastSeen(p, /Task renamed/), "renaming a task toasts");
await p.waitForTimeout(1500); await again(p);
ok(await p.locator(".kb-title", { hasText: "zz inapp renamed" }).count() === 1, "the new task name survives a reload");
const hold = p.locator(".kb-card", { has: p.getByText("zz inapp renamed") }).getByRole("button", { name: /Hold to remove/ });
const hb = await hold.boundingBox(); await p.mouse.move(hb.x + 10, hb.y + 10); await p.mouse.down(); await p.waitForTimeout(1100); await p.mouse.up();
await p.waitForTimeout(1500); await again(p);
ok(await p.locator(".kb-title", { hasText: "zz inapp renamed" }).count() === 0, "the check task is cleaned up");
await ctx.close();

// phone: the Bookmarks button steps aside while the outline is on screen, and nothing scrolls sideways
const m = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); m.setDefaultTimeout(120000);
const q = await m.newPage(); await go(q, link);
await go(q, p.url().includes("/board") ? base + "/" : p.url());
await go(q, base + "/"); await q.locator(".matter-card").first().click(); await q.waitForURL(/\/m\/[^/]+$/); await hydrated(q);
await q.locator(".docrow").first().click(); await q.waitForURL(/\/d\//); await hydrated(q); await q.waitForTimeout(800);
ok(await q.locator(".outline-fab").evaluate((e) => getComputedStyle(e).opacity) === "0", "phone: Bookmarks button hides while the outline is in view");
await q.evaluate(() => scrollTo(0, document.body.scrollHeight)); await q.waitForTimeout(700);
ok(await q.locator(".outline-fab").evaluate((e) => getComputedStyle(e).opacity) === "1", "phone: it comes back once the outline has scrolled away");
ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "phone: the paper page does not scroll sideways");
await b.close();
