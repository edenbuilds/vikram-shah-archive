// Real papers, live: upload files to the test matter (or re-check --docs), then for each paper check the
// Bookmarks | Annotations panel at desktop and phone width, the phone sheet, and that a bookmark opens
// its page. Prints counts, never the paper's words.
//   node scripts/real-papers-check.mjs <base> <signin-link> <file>... [--docs id,id] [--shots dir]
import { webkit } from "playwright";
const args = process.argv.slice(2);
const take = (f) => (args.includes(f) ? args.splice(args.indexOf(f), 2)[1] : null);
const given = take("--docs")?.split(","), shots = take("--shots");
const [base, link, ...files] = args;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
const noSideways = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const M = `${base}/m/zz-upload-test`;
await p.goto(link, { waitUntil: "networkidle" });
const listed = async () => { await p.goto(M, { waitUntil: "networkidle" }); return [...new Set(await p.$$eval("a[href*='/d/']", (as) => as.map((a) => a.getAttribute("href").split("/d/")[1]?.split(/[?/]/)[0]).filter(Boolean)))]; };
let docs = given;
if (!docs) {
  const before = new Set(await listed());
  await p.goto(`${M}/upload`, { waitUntil: "networkidle" });
  await p.setInputFiles("input[type=file]", files);
  await p.locator("button", { hasText: /^Upload \d+ files?/ }).click();
  // stay on the page until every file is sent (leaving it aborts the upload)
  await p.waitForFunction((n) => (document.body.innerText.match(/· (queued|failed)/g) ?? []).length >= n, files.length, { timeout: 1800000, polling: 2000 });
  ok(!(await p.locator("text=/· failed/").count()), "every file uploaded");
  docs = [];
  for (let k = 0; k < 120 && docs.length < files.length; k++) {  // big scans: up to an hour
    await p.waitForTimeout(30000);
    docs = (await listed()).filter((d) => !before.has(d));
  }
  ok(docs.length === files.length, `filed ${docs.length}/${files.length}: ${docs.join(", ")}`);
}
for (const doc of docs) {
  for (const w of [1280, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto(`${M}/d/${doc}?p=1`, { waitUntil: "networkidle" });
    const panel = p.locator(".outline-inline");
    const rows = await panel.locator(".olist li a").count();
    await panel.getByRole("tab", { name: /Annotations/ }).click();
    const filters = await panel.locator(".filters button").allInnerTexts();
    const notes = await panel.locator(".olist li a").count();
    console.log(`  ${w}px ${doc}: ${rows} bookmark rows, ${notes} annotations [${filters.join(" | ")}]`);
    ok(await noSideways(), `${w}px ${doc}: no sideways scroll`);
    if (w === 390) {
      await p.locator(".outline-fab").click();
      const sheet = p.locator("dialog.outline-sheet");
      ok(await sheet.isVisible(), `390px ${doc}: Bookmarks button opens the sheet`);
      const links = sheet.locator(".olist li a");
      const n = await links.count();
      if (n > 2) {
        const target = await links.nth(2).getAttribute("href");
        await links.nth(2).click();
        await p.waitForURL((u) => u.href.includes(target.split("?")[1]), { timeout: 15000 }).catch(() => {});
        ok(p.url().includes(target.split("?")[1]) && !(await sheet.isVisible()), `390px ${doc}: tapping a bookmark opens ${target.split("?")[1]} and closes the sheet`);
        const pg = Number(target.split("p=")[1]);
        ok((await p.locator(".pager .where b").first().innerText()) === String(pg), `390px ${doc}: pager shows page ${pg}`);
      }
      if (shots) { if (!(await sheet.isVisible())) await p.locator(".outline-fab").click(); await p.screenshot({ path: `${shots}/${doc}-390.png` }); await p.keyboard.press("Escape"); }
    }
  }
}
await b.close();
