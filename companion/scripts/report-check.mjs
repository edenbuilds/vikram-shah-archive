// Gesture and report-flow check for components/Report.tsx.
//   node --env-file=.env.local scripts/report-check.mjs <base> [send]
// Without "send" nothing is posted: it proves the gestures, the menu, the dialog and the screenshot. With "send" it files one real
// report (clearly labelled as a test) and checks it shows in Settings, Problems. The sign-in token is built here from
// COMPANION_LINK_SECRET and never printed.
import { createHmac } from "node:crypto";
import { devices } from "playwright";
import { launch } from "./browsers.mjs";
import { writeFileSync } from "node:fs";
const [base, mode, only] = process.argv.slice(2), send = mode === "send";
const email = "omkar1sonawane@gmail.com";
const link = `${base}/k/${Buffer.from(email).toString("base64url")}.${createHmac("sha256", process.env.COMPANION_LINK_SECRET).update(`v1:${email}`).digest("base64url")}`;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const menu = (p) => p.locator('.quick-menu[data-report-ui] [role=menuitem]');

async function run(name, browserName, ctxOpts, touch) {
  const b = await launch(browserName);
  const ctx = await b.newContext(ctxOpts); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); if (process.env.DEBUG_REPORT) p.on("console", (m) => console.log("  console", m.type(), m.text().slice(0, 160)));
  await p.goto(link, { waitUntil: "networkidle" });
  await p.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.fetch.toString().includes("next-action"));
  // an empty spot: the right margin of the page, below the header
  const empty = await p.evaluate(() => { const w = innerWidth, h = innerHeight; for (let y = h - 8; y > 120; y -= 24) for (let x = w - 6; x > w - 40; x -= 10) { const e = document.elementFromPoint(x, y); if (e && !e.closest("a, button, input, textarea, select, summary, label, dialog, nav, header")) return { x, y }; } return null; });
  ok(!!empty, `${name}: found an empty spot`);
  if (!empty) { await b.close(); return; }

  // 1. nothing opens on a single click or on a control
  if (!touch) await p.mouse.click(empty.x, empty.y);
  ok(await menu(p).count() === 0, `${name}: one click opens nothing`);
  const btn = p.locator(".settings-nav a").first(); const bb = await btn.boundingBox();
  if (bb && !touch) { await p.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2); ok(await menu(p).count() === 0, `${name}: double-click on a button opens nothing`); }
  const para = p.locator("main p.muted, main .subtle").first(); const pb = await para.boundingBox();
  if (pb && !touch) { await p.mouse.dblclick(pb.x + 12, pb.y + pb.height / 2); ok(await menu(p).count() === 0, `${name}: double-click on a word (selects it) opens nothing`); await p.mouse.click(empty.x, empty.y); }

  // 2. the gesture on empty space
  if (touch) {
    await p.touchscreen.tap(empty.x, empty.y); await p.waitForTimeout(80); await p.touchscreen.tap(empty.x, empty.y);
  } else await p.mouse.dblclick(empty.x, empty.y);
  await menu(p).first().waitFor({ timeout: 3000 }).catch(() => {});
  ok(await menu(p).count() === 1, `${name}: ${touch ? "double-tap" : "double-click"} on empty space shows Report a problem here`);
  if (await menu(p).count()) {
    const r = await p.locator(".quick-menu[data-report-ui]").boundingBox(); const vw = p.viewportSize().width;
    ok(r.x >= 0 && r.x + r.width <= vw, `${name}: the menu stays inside the screen`);
    await p.keyboard.press("Escape"); ok(await menu(p).count() === 0, `${name}: Escape closes it`);
  }
  // hold (synthetic touch pointer events: Playwright has no long-press)
  await p.evaluate(({ x, y }) => { const t = document.elementFromPoint(x, y); t.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); }, empty);
  await p.waitForTimeout(900);
  ok(await menu(p).count() === 1, `${name}: press and hold on empty space shows it`);
  await p.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", isPrimary: true, bubbles: true })));
  await p.keyboard.press("Escape");
  // a hold that moves is a scroll, not a report
  await p.evaluate(({ x, y }) => { const t = document.elementFromPoint(x, y); t.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true })); t.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", isPrimary: true, clientX: x, clientY: y - 40, bubbles: true })); }, empty);
  await p.waitForTimeout(900);
  ok(await menu(p).count() === 0, `${name}: a hold that moves opens nothing`);

  // 3. the account menu entry opens the dialog with a screenshot
  await p.locator("details.account summary").click();
  await p.getByRole("menuitem", { name: "Report a problem" }).click();
  const dlg = p.locator("dialog.report-dialog");
  await p.evaluate(() => addEventListener("report:open", () => console.log("report:open fired")));
  await dlg.waitFor({ state: "visible", timeout: 5000 }).catch(async () => console.log("  dialog state", JSON.stringify(await p.evaluate(() => ({ el: !!document.querySelector("dialog.report-dialog"), open: document.querySelector("dialog.report-dialog")?.open, menus: document.querySelectorAll(".quick-menu").length, acct: document.querySelector("details.account")?.open })))));
  ok(await dlg.isVisible(), `${name}: the dialog opens from the account menu`);
  const img = dlg.locator(".report-shot img"), t0 = Date.now(); await img.waitFor({ timeout: 25000 }).catch(() => {}); if (process.env.DEBUG_REPORT) console.log("  shot wait ms", Date.now() - t0, "text:", await dlg.locator(".report-shot").innerText());
  const n = await img.count(); ok(n === 1, `${name}: the screenshot is ready (${n} image)`);
  if (await img.count()) {
    const src = await img.getAttribute("src"); writeFileSync(`${process.env.TMPDIR || "/tmp"}/report-${name}.jpg`, Buffer.from(src.split(",")[1], "base64"));
    // 06-10-2026: the first test report was the header over a blank page (animations restarted in html2canvas's copy). Count ink below the header.
    const ink = await img.evaluate(async (im) => { await im.decode(); const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext("2d"); x.drawImage(im, 0, 0); const top = Math.round(c.height * 0.14); const d = x.getImageData(0, top, c.width, c.height - top).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 250) + Math.abs(d[i + 1] - 249) + Math.abs(d[i + 2] - 246) > 60) n++; return n / (d.length / 4); });
    ok(ink > 0.004, `${name}: the screenshot shows the page, not just the header (${(ink * 100).toFixed(1)}% ink)`);
    ok(src.length < 3_000_000, `${name}: the screenshot is ${(src.length / 1e6).toFixed(2)} MB, under the 3 MB cap`);
  }
  const box = await dlg.boundingBox(), vs = p.viewportSize();
  ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= vs.width && box.y + box.height <= vs.height + 1, `${name}: the dialog fits the screen`);
  await dlg.getByRole("radio", { name: /Looks wrong/ }).click().catch(() => {});
  await dlg.locator("textarea").fill(send ? "TEST report from scripts/report-check.mjs. Please ignore: checking that the email, the screenshot and Settings, Problems work." : "check");
  if (send) {
    await dlg.getByRole("button", { name: "Send report" }).click();
    await p.locator(".toast").filter({ hasText: /Sent\. Reference CC-/ }).waitFor({ timeout: 30000 }).catch(() => {});
    ok(await p.locator(".toast").filter({ hasText: /Sent\. Reference CC-/ }).count() > 0, `${name}: the toast says the email was sent`);
    await p.goto(`${base}/settings?after=send#reports`, { waitUntil: "networkidle" });
    ok(await p.getByText(/TEST report from scripts\/report-check/).count() > 0, `${name}: the report is listed in Settings, Problems`);
  } else { await dlg.getByRole("button", { name: "Cancel" }).click(); ok(!(await dlg.isVisible()), `${name}: Cancel closes it`); }
  ok(!errs.length, `${name}: no page errors ${errs.slice(0, 2).join(" | ")}`);
  await b.close();
}

const want = (n) => !only || new RegExp(only).test(n);
if (want("chromium")) await run("chromium-desktop", "chromium", { viewport: { width: 1440, height: 900 } }, false);
if (want("iphone")) await run("webkit-iphone", "webkit", { ...devices["iPhone 13"] }, true);
if (!send) { if (want("firefox")) await run("firefox-desktop", "firefox", { viewport: { width: 1280, height: 800 } }, false); if (want("ipad")) await run("webkit-ipad-pro-13", "webkit", { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices["iPad Pro 11"].userAgent }, true); }
console.log(fails ? `${fails} checks failed` : "all report checks passed");
process.exit(fails ? 1 : 0);
