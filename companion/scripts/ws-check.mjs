// Workspace view check: signs in with Omkar's link, opens /m/<first matter>/workspace at 1440 and 390, screenshots, prints a verdict.
import { createHmac } from "node:crypto";
import { launch } from "./browsers.mjs";
const base = process.argv[2] ?? "http://localhost:3060", out = process.argv[3] ?? ".";
const email = "omkar1sonawane@gmail.com";
const link = `${base}/k/${Buffer.from(email).toString("base64url")}.${createHmac("sha256", process.env.COMPANION_LINK_SECRET).update(`v1:${email}`).digest("base64url")}`;
const b = await launch("chromium");
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(link); await p.goto(base + "/");
  const href = await p.locator('a[href^="/m/"]').first().getAttribute("href");
  const m = process.env.WS_M ?? href.split("/")[2];
  await p.goto(`${base}/m/${m}/workspace${process.env.WS_D ? "?d=" + process.env.WS_D : ""}`, { timeout: 90000 }); await p.waitForTimeout(2500);
  const v = await p.evaluate(() => ({ docs: document.querySelectorAll(".ws-list a").length, pages: document.querySelectorAll(".ws-pages figure").length,
    loaded: [...document.querySelectorAll(".ws-pages img")].filter((i) => i.complete && i.naturalWidth).length,
    notes: document.querySelectorAll(".ws-note").length, sources: document.querySelectorAll(".ws-sources li").length, hscroll: document.documentElement.scrollWidth > innerWidth }));
  if (v.notes) { await p.locator(".ws-note").first().click(); await p.waitForTimeout(900); v.line = await p.locator(".ws-link path").count(); }
  await p.locator(".ws-toggle button", { hasText: "Outline" }).click(); v.outline = await p.locator(".ws-list li").count();
  await p.locator(".ws-toggle button", { hasText: "Documents" }).click();
  await p.screenshot({ path: `${out}/ws-${w}.png` });
  console.log(w, m, JSON.stringify(v), errs.slice(0, 2));
}
await b.close();
