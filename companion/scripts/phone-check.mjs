// Sideways-scroll check in WebKit (Safari's engine) at iPhone size, signed in via a personal link.
//   node scripts/phone-check.mjs <base> <signin-link> [shots-dir]
import { webkit, devices } from "playwright";
const [base, link, shots] = process.argv.slice(2);
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const p = await ctx.newPage();
await p.goto(link, { waitUntil: "networkidle" });
const pages = ["/", "/m/lade-v-state-wp-1575-2026", "/m/lade-v-state-wp-1575-2026/map", "/m/shetty-v-oberoi/d/complaint-exhibit-d-agreement-for-sale-dated-19-08-2015-b7409c27",
  "/ask", "/ask?m=shetty-v-oberoi", "/connect", "/m/lade-v-state-wp-1575-2026/upload", "/m/lade-v-state-wp-1575-2026/hearings", "/m/lade-v-state-wp-1575-2026/chronology", "/m/lade-v-state-wp-1575-2026/collections", "/login"];
let bad = 0;
for (const path of pages) {
  for (let k = 0; k < 3; k++) { try { await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 }); break; } catch { await p.waitForTimeout(2000); } }
  const r = await p.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const inScroller = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if (o === "auto" || o === "scroll") return true; } return false; };
    const wide = [...document.querySelectorAll("body *")].filter((e) => !inScroller(e) && e.getBoundingClientRect().right > W + 1 && ![...e.children].some((c) => c.getBoundingClientRect().right > W + 1))
      .slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} "${(e.textContent || "").trim().slice(0, 30)}"`);
    return { W, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, wide };
  });
  const over = Math.max(r.sw, r.bw) > r.W + 1 || r.wide.length > 0;
  bad += over ? 1 : 0;
  console.log(`${over ? "OVERFLOW" : "ok      "} ${path.slice(0, 60)}  (${r.W}px, content ${Math.max(r.sw, r.bw)}px) ${r.wide.join(" | ")}`);
  if (shots && (path === "/" || path.startsWith("/ask?") || over)) await p.screenshot({ path: `${shots}/${path.replace(/[^a-z0-9]+/gi, "_") || "home"}.png` });
}
console.log(bad ? `${bad} page(s) overflow` : "no sideways scroll on any page");
await b.close();
