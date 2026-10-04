// Her own page bookmark, saved and removed on the test matter, at desktop and phone width.
//   node scripts/bookmark-check.mjs <base> <signin-link>
import { webkit } from "playwright";
const [base, link] = process.argv.slice(2);
const b = await webkit.launch();
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
for (const [w, h] of [[1280, 900], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(link, { waitUntil: "networkidle" });
  await p.goto(base + "/m/zz-upload-test", { waitUntil: "networkidle" });
  const paper = await p.locator("a[href*='/m/zz-upload-test/d/']").first().getAttribute("href");
  await p.goto(base + paper + "?p=1", { waitUntil: "networkidle" });
  const name = `check ${w}px`;
  await p.fill("input[aria-label='Bookmark name']", name);
  await p.click("button:has-text('Bookmark')");
  const row = p.locator("ol.contents li", { hasText: name });
  ok(await row.waitFor({ timeout: 30000 }).then(() => true, () => false), `${w}px: bookmark listed under Bookmarked by you`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${w}px: no sideways scroll`);
  await row.locator("button", { hasText: "remove" }).click();
  ok(await row.waitFor({ state: "detached", timeout: 30000 }).then(() => true, () => false), `${w}px: bookmark removed`);
}
await b.close();
