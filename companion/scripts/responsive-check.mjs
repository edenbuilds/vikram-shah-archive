// Sideways-overflow check + screenshots across devices, in WebKit (Safari's engine).
//   node scripts/responsive-check.mjs <base> <signin-link> [shots-dir]
import { webkit, devices } from "playwright";
const [base, link, shots] = process.argv.slice(2);
const DEVICES = {
  "iphone": devices["iPhone 13"],
  "ipad-pro-13-portrait": { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices["iPad Pro 11"].userAgent },
  "ipad-pro-13-landscape": { viewport: { width: 1376, height: 1032 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices["iPad Pro 11 landscape"].userAgent },
  "desktop": { viewport: { width: 1440, height: 900 } },
};
const PAGES = ["/", "/m/lade-v-state-wp-1575-2026", "/m/lade-v-state-wp-1575-2026/map", "/m/shetty-v-oberoi/d/complaint-exhibit-d-agreement-for-sale-dated-19-08-2015-b7409c27",
  "/ask", "/ask?m=shetty-v-oberoi", "/settings", "/m/shetty-v-oberoi/collections", "/m/lade-v-state-wp-1575-2026/upload", "/m/lade-v-state-wp-1575-2026/hearings", "/m/lade-v-state-wp-1575-2026/chronology", "/m/lade-v-state-wp-1575-2026/collections",
  "/m/shetty-v-oberoi/brief", "/m/shetty-v-oberoi/compare", "/m/shetty-v-oberoi/chronology/papers", "/search?q=withdrawal+of+the+appeal", "/pins",
  "/m/agile-real-estate-pvt-ltd-vs-vikram-singh-85ba/explainer", "/m/shah-v-trindade/explainer", "/m/agile-real-estate-pvt-ltd-vs-vikram-singh-85ba/d/exhibit-h-copy-of-the-impugned-order-8c5a5c69?pg=254"];
const b = await webkit.launch();
let bad = 0;
for (const [name, dev] of Object.entries(DEVICES)) {
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
  await ctx.close();
}
console.log(bad ? `${bad} page/device combinations overflow` : "no sideways scroll on any page, any device");
await b.close();
