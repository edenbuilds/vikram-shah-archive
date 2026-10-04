// LiquidText both ways, live, on the test matter: upload a .ltproj and a zipped .ltproj folder, check the
// papers, their per-document bookmarks and notes at desktop and phone width, then the PDF-with-notes export.
//   node scripts/liquidtext-check.mjs <base> <signin-link> <project.ltproj> <folder.ltproj.zip>
//   ... --docs <id>,<id>   re-check papers already filed (same bytes are not filed twice)
import { webkit } from "playwright";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
const args = process.argv.slice(2);
const given = args.includes("--docs") ? args.splice(args.indexOf("--docs"), 2)[1].split(",") : null;
const [base, link, ...files] = args;
const b = await webkit.launch();
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
const noSideways = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
await p.goto(link, { waitUntil: "networkidle" });
const listed = async () => { await p.goto(base + "/m/zz-upload-test", { waitUntil: "networkidle" }); return p.$$eval("a[href*='/d/zz-lt']", (as) => as.map((a) => a.getAttribute("href").split("/d/")[1].split("?")[0])); };
let docs = given;
if (!docs) {
  const before = new Set(await listed());
  await p.goto(base + "/m/zz-upload-test/upload", { waitUntil: "networkidle" });
  ok(await noSideways(), "390px: upload page, no sideways scroll");
  await p.setInputFiles("input[type=file]", files);
  ok(await p.locator("button", { hasText: /^Upload 2 files/ }).isVisible(), "both LiquidText files accepted (the zipped folder is not unpacked)");
  await p.locator("button", { hasText: /^Upload 2 files/ }).click();
  docs = [];
  for (let k = 0; k < 40 && docs.length < files.length; k++) {
    await p.waitForTimeout(8000);
    docs = [...new Set(await listed())].filter((d) => !before.has(d));
  }
  ok(docs.length === files.length, `both projects filed as papers (${docs.length}/${files.length})`);
}
const hrefs = docs.map((d) => `/d/${d}`);
for (const href of hrefs) {
  const doc = href.split("/d/")[1].split("?")[0];
  for (const w of [1280, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto(`${base}/m/zz-upload-test/d/${doc}?p=1`, { waitUntil: "networkidle" });
    const t = await p.locator("main").innerText();
    ok(t.includes("Plaint") && t.includes("Written Statement"), `${w}px ${doc}: a bookmark per document`);
    ok(t.includes("Check the address in the agreement") && t.includes("The suit property is Flat 4"), `${w}px ${doc}: excerpt + comment on p. 1`);
    ok(await noSideways(), `${w}px ${doc}: no sideways scroll`);
  }
  await p.goto(`${base}/m/zz-upload-test/d/${doc}?p=3`, { waitUntil: "networkidle" });
  const t3 = await p.locator("main").innerText();
  ok(t3.includes("Contradicts the rent receipts") && t3.includes("denies that any rent was due"), `${doc}: SQLite excerpt placed on p. 3 (second document's second page)`);
  const r = await ctx.request.get(`${base}/m/zz-upload-test/d/${doc}/download/liquidtext`);
  const pdf = await PDFDocument.load(await r.body());
  const all = pdf.getPages().flatMap((pg, i) => (pg.node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? [])
    .map((a) => [i + 1, pdf.context.lookup(a, PDFDict).lookup(PDFName.of("Contents"))?.decodeText?.() ?? ""]));
  ok(all.some(([i, c]) => i === 1 && c.includes("Check the address")) && all.some(([i, c]) => i === 3 && c.includes("Contradicts")), `${doc}: export carries her notes on the right pages (${all.length} comments)`);
}
await b.close();
