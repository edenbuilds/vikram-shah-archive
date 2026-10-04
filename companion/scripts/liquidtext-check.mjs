// LiquidText both ways, live, on the test matter: upload a .ltproj and a zipped .ltproj folder, check the
// papers, their per-document bookmarks and notes at desktop and phone width, then the PDF-with-notes export.
//   node scripts/liquidtext-check.mjs <base> <signin-link> <project.ltproj> <folder.ltproj.zip>
import { webkit } from "playwright";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
const [base, link, ...files] = process.argv.slice(2);
const b = await webkit.launch();
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
const noSideways = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
await p.goto(link, { waitUntil: "networkidle" });
await p.goto(base + "/m/zz-upload-test/upload", { waitUntil: "networkidle" });
ok(await noSideways(), "390px: upload page, no sideways scroll");
await p.setInputFiles("input[type=file]", files);
ok(await p.locator("button", { hasText: /^Upload 2 files/ }).isVisible(), "both LiquidText files accepted (the zipped folder is not unpacked)");
await p.locator("button", { hasText: /^Upload 2 files/ }).click();
const slugs = files.map((f) => f.split("/").pop().replace(/\.ltproj(\.zip)?$/i, ""));
let hrefs = [];
for (let k = 0; k < 40 && hrefs.length < slugs.length; k++) {
  await p.waitForTimeout(8000);
  await p.goto(base + "/m/zz-upload-test", { waitUntil: "networkidle" });
  hrefs = (await Promise.all(slugs.map((s) => p.locator(`a[href*='/d/${s}']`).first().getAttribute("href", { timeout: 1000 }).catch(() => null)))).filter(Boolean);
}
ok(hrefs.length === slugs.length, `both projects filed as papers (${hrefs.length}/${slugs.length})`);
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
  const all = pdf.getPages().flatMap((pg, i) => (pg.node.lookup(PDFName.of("Annots"), PDFArray)?.asArray() ?? [])
    .map((a) => [i + 1, pdf.context.lookup(a, PDFDict).lookup(PDFName.of("Contents"))?.decodeText?.() ?? ""]));
  ok(all.some(([i, c]) => i === 1 && c.includes("Check the address")) && all.some(([i, c]) => i === 3 && c.includes("Contradicts")), `${doc}: export carries her notes on the right pages (${all.length} comments)`);
}
await b.close();
