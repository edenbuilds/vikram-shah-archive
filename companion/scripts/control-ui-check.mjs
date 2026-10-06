// Settings, Connected apps (06-10-2026): the three choices are plain radios, the choice sticks after a reload, nothing overflows at 390px,
// and no screen says "AI" to her. Puts her original mode back.
// node --env-file=.env.local scripts/control-ui-check.mjs <base-url> [email]
import { createHmac } from "node:crypto";
import { launch } from "./browsers.mjs";
const base = process.argv[2] || "http://localhost:3061", email = (process.argv[3] || "omkar1sonawane@gmail.com").toLowerCase();
const link = `${base}/k/${Buffer.from(email).toString("base64url")}.${createHmac("sha256", process.env.COMPANION_LINK_SECRET).update(`v1:${email}`).digest("base64url")}`;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const b = await launch("chromium");
for (const [name, vp] of [["desktop", { width: 1280, height: 860 }], ["390px", { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  await p.goto(link, { waitUntil: "networkidle" });
  for (const path of ["/", "/settings", "/connect", "/search", "/pins"]) {
    await p.goto(`${base}${path}`, { waitUntil: "networkidle" });
    ok(!/\bAI\b/.test(await p.locator("body").innerText()), `${name}: ${path} never says AI`);
  }
  await p.goto(`${base}/settings#apps`, { waitUntil: "networkidle" });
  const radios = p.locator("#apps input[name=mcp-mode]");
  ok(await radios.count() === 3, `${name}: three plain choices`);
  const was = await radios.evaluateAll((rs) => rs.find((r) => r.checked)?.value);
  const pick = was === "off" ? "review" : "off";
  await p.locator(`#apps input[value=${pick}]`).check();
  await p.waitForTimeout(1500);
  await p.goto(`${base}/settings?again=${name}#apps`, { waitUntil: "networkidle" });
  ok(await p.locator(`#apps input[value=${pick}]`).isChecked(), `${name}: the choice is still there after a reload`);
  await p.locator(`#apps input[value=${was}]`).check();
  await p.waitForTimeout(1500);
  await p.goto(`${base}/settings?back=${name}#apps`, { waitUntil: "networkidle" });
  ok(await p.locator(`#apps input[value=${was}]`).isChecked(), `${name}: her own mode is back`);
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${name}: nothing scrolls sideways`);
  const box = await p.locator("#apps .mode-opt").first().boundingBox();
  ok(box.height >= 44, `${name}: each choice is at least 44px tall to tap (${Math.round(box.height)})`);
}
await b.close();
console.log(fails ? `${fails} checks failed` : "all connected-apps checks passed");
process.exit(fails ? 1 : 0);
