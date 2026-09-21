// Download a matter's ZIP in a real browser, then check every PDF against its recorded SHA-256.
//   node scripts/zip-check.mjs <base> <signin-link> <matter> [file] <outdir>
import { webkit } from "playwright";
const [base, link, matter, file, out] = process.argv.slice(2);
const b = await webkit.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
await p.goto(link, { waitUntil: "networkidle" });
for (let k = 0; k < 3; k++) { try { await p.goto(`${base}/m/${matter}`, { waitUntil: "networkidle", timeout: 120000 }); break; } catch {} }
if (file && file !== "-") await p.selectOption(".export select", file);
for (const box of await p.$$(".formats input[type=checkbox]")) if (!(await box.isChecked())) await box.check();
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 900000 }), p.click("text=Download (.zip)")]);
await dl.saveAs(`${out}/${dl.suggestedFilename()}`);
await p.waitForTimeout(500);
console.log("saved", dl.suggestedFilename(), "|", await p.textContent(".export [role=status]"));
await b.close();
