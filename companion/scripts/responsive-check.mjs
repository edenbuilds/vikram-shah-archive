// Sideways-overflow check + screenshots across the device and browser matrix (emulated: Playwright's Chrome, WebKit and Firefox,
// not real phones, tablets or every browser). The sign-in link is built from COMPANION_LINK_SECRET and never printed.
//   node --env-file=.env.local scripts/responsive-check.mjs <base> [shots-dir] [device-name-regex]
import { createHmac } from "node:crypto";
import { devices } from "playwright";
import { launch } from "./browsers.mjs";
const [base, shots, only] = process.argv.slice(2);
const email = "omkar1sonawane@gmail.com";
const link = `${base}/k/${Buffer.from(email).toString("base64url")}.${createHmac("sha256", process.env.COMPANION_LINK_SECRET).update(`v1:${email}`).digest("base64url")}`;
const tab = (w, h, ua) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices[ua].userAgent });
const DEVICES = {
  "iphone-safari": ["webkit", devices["iPhone 13"]],
  "iphone-se-safari": ["webkit", devices["iPhone SE"]],
  "android-chrome": ["chromium", devices["Pixel 7"]],
  "ipad-safari-portrait": ["webkit", tab(820, 1180, "iPad Pro 11")],
  "ipad-pro-11-landscape": ["webkit", tab(1194, 834, "iPad Pro 11 landscape")],
  "ipad-pro-13-portrait": ["webkit", tab(1032, 1376, "iPad Pro 11")],
  "ipad-pro-13-landscape": ["webkit", tab(1376, 1032, "iPad Pro 11 landscape")],
  "android-tablet-chrome": ["chromium", devices["Galaxy Tab S4"]],
  "macbook-air-safari": ["webkit", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  "macbook-pro-16-chrome": ["chromium", { viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 }],
  "windows-laptop-edge-1366": ["chromium", { viewport: { width: 1366, height: 768 } }],
  "windows-laptop-chrome-1536": ["chromium", { viewport: { width: 1536, height: 730 }, deviceScaleFactor: 1.25 }],
  "windows-laptop-firefox": ["firefox", { viewport: { width: 1366, height: 768 } }],
  "mac-firefox": ["firefox", { viewport: { width: 1440, height: 900 } }],
};
const PAGES = ["/", "/m/lade-v-state-wp-1575-2026", "/m/lade-v-state-wp-1575-2026/map", "/m/shetty-v-oberoi/d/complaint-exhibit-d-agreement-for-sale-dated-19-08-2015-b7409c27",
  "/ask", "/ask?m=shetty-v-oberoi", "/settings", "/settings#apps", "/m/shetty-v-oberoi/collections", "/m/lade-v-state-wp-1575-2026/upload", "/m/lade-v-state-wp-1575-2026/hearings", "/m/lade-v-state-wp-1575-2026/chronology", "/m/lade-v-state-wp-1575-2026/collections",
  "/m/shetty-v-oberoi/brief", "/m/shetty-v-oberoi/compare", "/m/shetty-v-oberoi/chronology/papers", "/search?q=withdrawal+of+the+appeal", "/pins",
  "/m/agile-real-estate-pvt-ltd-vs-vikram-singh-85ba/explainer", "/m/shah-v-trindade/explainer", "/m/agile-real-estate-pvt-ltd-vs-vikram-singh-85ba/d/exhibit-h-copy-of-the-impugned-order-8c5a5c69?pg=254",
  "/m/shetty-v-oberoi/reading", "/m/shah-v-trindade/reading", "/settings#skills", "/board", "/m/shah-v-trindade/d/list-dates"];
let bad = 0;
for (const [name, [engine, dev]] of Object.entries(DEVICES)) {
  if (only && !new RegExp(only).test(name)) continue;
  const b = await launch(engine);
  const ctx = await b.newContext(dev); const p = await ctx.newPage();
  await p.goto(link, { waitUntil: "networkidle" });
  const thread = await p.evaluate(async () => (await (await fetch("/ask")).text()).match(/\/ask\?t=([0-9a-f-]{36})/)?.[1]);
  for (const path of [...PAGES, ...(thread ? [`/ask?t=${thread}`] : [])]) {
    for (let k = 0; k < 3; k++) { try { await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 }); break; } catch { await p.waitForTimeout(2000); } }
    const r = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const inScroller = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
      const wide = [...document.querySelectorAll("body *")].filter((e) => !inScroller(e) && e.getBoundingClientRect().right > W + 1 && ![...e.children].some((c) => c.getBoundingClientRect().right > W + 1))
        .slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} "${(e.textContent || "").trim().slice(0, 30)}"`);
      return { W, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), wide };
    });
    const over = r.sw > r.W + 1 || r.wide.length > 0;
    bad += over ? 1 : 0;
    if (over) console.log(`OVERFLOW ${name} ${path.slice(0, 50)} (${r.W}px, content ${r.sw}px) ${r.wide.join(" | ")}`);
    if (shots) await p.screenshot({ path: `${shots}/${name}__${path.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "home"}.png`, fullPage: false });
  }
  console.log(`${name}: checked ${PAGES.length + (thread ? 1 : 0)} pages`);
  await ctx.close(); await b.close();
}
console.log(bad ? `${bad} page/device combinations overflow` : "no sideways scroll on any page, any device");
