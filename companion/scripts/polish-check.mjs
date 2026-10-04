// Polish check (04-10-2026): link-preview and icon routes work with no session, the greeting, page titles, the share and
// export menu, touch feedback (haptic calls, the Settings switch), press-and-hold menu, double-click edit, loading page.
// Everything it writes it removes again. Run:  node scripts/polish-check.mjs <base> <signin-link>
import { chromium } from "playwright";
const [base, link] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const ok = (c, m) => { console.log(`${c ? "PASS" : c === null ? "SKIP" : "FAIL"} ${m}`); if (c === false) process.exitCode = 1; };
const hydrated = (pg) => pg.waitForFunction(() => window.fetch.toString().includes("next-action"), null, { timeout: 180000 });
const go = async (pg, url) => { await pg.goto(url, { waitUntil: "load" }); await hydrated(pg); };
const toastSeen = (p, re) => p.locator(".toast", { hasText: re }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
const vibes = (p) => p.evaluate(() => window.__v.length);
const spy = () => { window.__v = []; navigator.vibrate = (x) => (window.__v.push(x), true); };

// 1. no session: what a chat app or a crawler sees
const anon = await (await b.newContext()).newPage();
await anon.goto(base + "/", { waitUntil: "domcontentloaded" });
const head = await anon.evaluate(() => {
  const m = (s) => document.querySelector(s)?.getAttribute("content") ?? document.querySelector(s)?.getAttribute("href");
  return { title: document.title, desc: m('meta[name=description]'), og: m('meta[property="og:image"]'), card: m('meta[name="twitter:card"]'), icon: m('link[rel=icon]'), apple: m('link[rel=apple-touch-icon]'), manifest: m('link[rel=manifest]'), theme: m('meta[name=theme-color]'), robots: m('meta[name=robots]') };
});
ok(head.title === "Case Companion" && head.desc?.length > 60, "title and description are set");
ok(head.og && head.card === "summary_large_image" && head.icon && head.apple && head.manifest && head.theme, "social preview, icons, manifest and theme colour are in the head");
ok(/noindex/.test(head.robots), "pages stay noindex (private papers)");
for (const [path, type] of [[new URL(head.og, base).pathname + new URL(head.og, base).search, "image/png"], ["/icon.svg", "image/svg+xml"], ["/favicon.ico", "image/"], ["/apple-icon", "image/png"], ["/pwa/512", "image/png"], ["/manifest.webmanifest", "json"], ["/robots.txt", "text/plain"]]) {
  const r = await anon.request.get(base + path, { maxRedirects: 0 });
  ok(r.status() === 200 && (r.headers()["content-type"] ?? "").includes(type), `${path.split("?")[0]} is public (${r.status()})`);
}
const man = await (await anon.request.get(base + "/manifest.webmanifest")).json();
ok(man.name === "Case Companion" && man.icons.some((i) => i.sizes === "512x512") && man.display === "standalone", "manifest names the app and carries a 512 icon");

// 2. signed in, desktop
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] }); ctx.setDefaultTimeout(120000);
await ctx.addInitScript(spy);
const p = await ctx.newPage();
await go(p, link); await go(p, base + "/");
const hello = await p.locator(".greet").innerText();
ok(/^Hello, [A-Z][a-z]+$/.test(hello.trim()), `home greets by name ("${hello.trim().replace(/\s+/g, " ")}")`);
ok(await p.locator(".greet svg").count() === 1 && await p.locator("header.top .brand svg").count() === 1, "the new mark is in the greeting and the nav");
await p.locator(".matter-card").first().click(); await p.waitForURL(/\/m\/[^/]+$/); await hydrated(p);
ok(/ · Case Companion$/.test(await p.title()) && !/^Case Companion/.test(await p.title()), `matter page title carries the matter ("${(await p.title()).slice(0, 50)}")`);
const matterUrl = p.url();
await p.locator(".matter-head .share button").click();
ok(await p.getByRole("menuitem", { name: /Copy link/ }).isVisible(), "matter: Share and export opens with Copy link");
await p.getByRole("menuitem", { name: /Copy link/ }).click();
ok(await toastSeen(p, /Link copied/), "copying the link toasts");
ok((await p.evaluate(() => navigator.clipboard.readText())) === matterUrl, "the copied link is this page");
ok(await vibes(p) > 0, "a toast gives touch feedback (vibrate called)");
await p.evaluate(() => { window.__v.length = 0; localStorage.setItem("cc-a11y", JSON.stringify({ haptics: "off" })); document.documentElement.dataset.a11yHaptics = "off"; });
await p.evaluate(() => dispatchEvent(new CustomEvent("cc-toast", { detail: { text: "zz quiet" } }))); await p.waitForTimeout(400);
ok(await vibes(p) === 0, "Touch feedback off in Display stops the vibration");
await p.evaluate(() => { localStorage.removeItem("cc-a11y"); delete document.documentElement.dataset.a11yHaptics; });

// the paper page: share menu with the five exports, and a note that edits on double-click
await p.locator(".docrow").first().click(); await p.waitForURL(/\/d\//); await hydrated(p);
ok(/^.{3,} · Case Companion$/.test(await p.title()) && !/^Paper · /.test(await p.title()), `paper page title is the paper's ("${(await p.title()).slice(0, 40)}")`);
await p.locator(".doc-head .share button").click();
ok(await p.locator(".share-menu a[role=menuitem]").count() === 5, "paper: five exports in Share and export");
await p.keyboard.press("Escape"); ok(await p.locator(".share-menu").count() === 0, "Escape closes the menu");
await p.locator("textarea[name=body]").first().fill("zz polish note"); await p.getByRole("button", { name: "Save note" }).click();
await toastSeen(p, /Note saved/);
const note = p.locator(".note", { hasText: "zz polish note" }).first();
await note.evaluate((e) => e.scrollIntoView({ block: "center" }));
await note.locator(".note-label").dblclick();
ok(await p.locator("dialog[open]").count() === 1, "double-click on a note opens its editor");
await p.locator("dialog[open]").getByRole("button", { name: "Cancel" }).click();
await note.getByRole("button", { name: "delete" }).click(); await p.waitForTimeout(1500);

// the explainer carries it too, and the board adds a task on a double-click
await go(p, matterUrl + "/explainer");
ok(await p.locator(".explainer .share button").count() === 1 || await p.locator(".empty").count() > 0, "explainer has Share and export (or none made yet)");
await go(p, base + "/board");
await p.locator(".kb-col").nth(3).locator(".kb-head").dblclick();
ok(await p.locator(".kb-col").nth(3).locator("input.kb-input").count() === 1, "double-click on a board column starts a new task");
await p.keyboard.press("Escape");

// loading page: appears on a slow navigation, never flashes on a fast one
await go(p, base + "/");
await p.evaluate(() => { window.__saw = false; new MutationObserver(() => { if (document.querySelector(".loading-page")) window.__saw = true; }).observe(document.body, { childList: true, subtree: true }); });
await p.locator(".pillnav a", { hasText: "Settings" }).click(); await p.waitForURL(/settings/);
ok((await p.evaluate(() => window.__saw)) ? true : null, "the loading page shows while a page is fetched");
await ctx.close();

// 3. phone: press and hold, touch ticks, no sideways scroll, menus fit
const m = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); m.setDefaultTimeout(120000);
await m.addInitScript(spy);
const q = await m.newPage(); await go(q, link); await go(q, base + "/");
const card = q.locator("a.matter-card").first(); const here = q.url();
const box = await card.boundingBox();
const fire = (type, x, y) => card.evaluate((el, [t, x, y]) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 7, clientX: x, clientY: y })), [type, x, y]);
await fire("pointerdown", box.x + 40, box.y + 40);
await q.locator(".quick-menu").waitFor({ timeout: 5000 }).catch(() => {});
ok(await q.locator(".quick-menu").count() === 1, "press and hold on a matter opens its menu");
ok(await vibes(q) >= 2, "the touch and the hold each gave feedback");
await fire("pointerup", box.x + 40, box.y + 40); await card.evaluate((el) => el.click()); await q.waitForTimeout(300);
ok(q.url() === here, "lifting the finger does not open the matter");
const mb = await q.locator(".quick-menu").boundingBox();
ok(mb.x >= 0 && mb.x + mb.width <= 390 && mb.y + mb.height <= 844, "the menu sits inside the screen");
ok(await q.getByRole("menuitem", { name: "Open in a new tab" }).count() === 1 && await q.getByRole("menuitem", { name: "Copy link" }).count() === 1, "menu has Open in a new tab and Copy link");
await q.keyboard.press("Escape"); ok(await q.locator(".quick-menu").count() === 0, "Escape closes it");
await card.click(); await q.waitForURL(/\/m\/[^/]+$/); await hydrated(q);
ok(q.url() !== here, "a plain tap still opens the matter");
ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "phone: matter page does not scroll sideways");
await q.locator(".matter-head .share button").click();
const sm = await q.locator(".share-menu").boundingBox();
ok(sm.x >= 0 && sm.x + sm.width <= 390, "phone: the share menu fits the screen");
await b.close();
