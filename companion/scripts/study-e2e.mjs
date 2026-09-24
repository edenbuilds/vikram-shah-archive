// The study aids as she uses them, in WebKit against the live site.
//   node scripts/study-e2e.mjs <base> <signin-link>
// Writes a brief and a comparison to shetty-v-oberoi (both are useful to her); pins are removed again.
import { webkit } from "playwright";
const [base, link] = process.argv.slice(2);
const b = await webkit.launch();
const p = await (await b.newContext()).newPage();
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
const go = (path) => p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
await p.goto(link, { waitUntil: "networkidle" });

await go("/");
ok(await p.isVisible("text=Agile Real Estate"), "the Agile matter shows on the workspace");
ok(await p.isVisible("a[aria-label=Search]") && await p.isVisible("a[aria-label=Pinned]"), "header has Search and Pinned");

await go("/search?q=withdrawal%20of%20the%20appeal");
const groups = await p.locator("main section.card").count();
ok(groups > 0 && await p.locator("main .receipt").count() > 0, `search across matters: ${await p.locator("main .receipt").count()} passages in ${groups} matter(s)`);
await p.locator(".pin-btn").first().click();
await p.locator(".pin-btn.on").first().waitFor({ timeout: 30000 }).then(() => ok(true, "pinned a search passage (quote checked on its page)"), () => ok(false, "pin a search passage"));
await go("/pins");
ok(await p.locator("ol.pins li").count() >= 1 && await p.isVisible("text=Copy as references"), "pinned list shows it with Copy as references");
while (await p.locator("ol.pins li").count()) { await p.locator("ol.pins button:has-text('Remove')").first().click(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800); }
ok(await p.isVisible("text=Nothing pinned yet"), "remove empties the list");

await go("/m/shetty-v-oberoi/chronology/papers");
const dates = await p.locator(".paper-dates > li").count();
const cites = await p.locator(".paper-dates cite").count();
ok(dates > 5 && cites >= dates, `dates in the papers: ${dates} dates, each with a page`);
ok(await p.locator(".paper-dates mark").count() >= dates, "the printed date is marked inside its quote");
await go("/m/shetty-v-oberoi/chronology/papers?y=2015");
ok((await p.locator(".paper-dates .date").allTextContents()).every((t) => t.endsWith("2015")), "year filter shows only that year");

await go("/m/shetty-v-oberoi/chronology/papers?o=newest");
const iso = (t) => t.split("-").reverse().join("-");
const order = (await p.locator(".paper-dates .date").allTextContents()).map(iso);
ok(order.length > 2 && order[0] > order.at(-1), `dates newest first: ${order[0]} … ${order.at(-1)}`);

const AG = "/m/agile-real-estate-pvt-ltd-vs-vikram-singh-85ba";
await go(`${AG}/explainer`);
const parts = await p.locator(".explainer .brief-section").count(), notes = await p.locator(".explainer ol.footnotes li").count();
ok(parts === 5 && notes > 20, `explainer: ${parts} parts, ${notes} footnotes`);
ok(await p.locator(".explainer table tbody tr").count() > 3, "explainer ends with a summary table");
ok(await p.isVisible("text=Your explainer (PDF)"), "her own explainer PDF is linked on the Agile matter");
ok((await p.locator(".explainer ol.footnotes cite").allTextContents()).some((t) => /p\. \d+ \(PDF \d+\)/.test(t)), "footnotes give the printed page with the PDF page");

await go("/m/shetty-v-oberoi/reading");
const read = await p.evaluate(() => ({ years: [...document.querySelectorAll(".explainer section.stack > h3")].map((h) => h.textContent), papers: document.querySelectorAll("article").length, receipts: document.querySelectorAll("article a q").length }));
ok(read.papers > 5 && read.receipts > read.papers, `reading order: ${read.papers} papers, ${read.receipts} receipts, years ${read.years.join(" ")}`);
ok(read.years.join() === [...read.years].sort().join() || read.years.at(-1) === "Undated", "reading order runs oldest first, undated last");
ok(await p.isVisible("text=Mentioned in the papers, not on file"), "reading order lists papers mentioned but not on file");
await go(`${AG}/upload`);
ok(/Word, Markdown/.test(await p.locator(".dropzone").innerText()), "upload takes Word, Markdown, photos and zips");
ok(/Last updated \d{2}-\d{2}-\d{4}, \d{2}:\d{2}/.test(await p.locator(".matter-head").innerText()), "the matter header shows when it was last updated");
await go(`${AG}/d/exhibit-h-copy-of-the-impugned-order-8c5a5c69?pg=254`);
ok(/Page 3 of \d+, printed 254/.test(await p.locator(".where").textContent()), "?pg=254 opens the page printed 254 (PDF p. 3)");

await go("/m/shetty-v-oberoi/compare");
await p.fill("input[placeholder^='e.g.']", "why the appeal is being withdrawn");
await p.click("button:has-text('Compare')");
await p.locator(".agent-steps.live li").first().waitFor({ timeout: 60000 }).then(() => ok(true, "compare shows the agent's steps live"), () => ok(false, "compare steps live"));
await p.waitForFunction(() => !document.querySelector(".agent-steps.live"), null, { timeout: 290000 });
const cmp = p.locator("section.card", { hasText: "why the appeal is being withdrawn" }).first();
await cmp.locator(".receipt, p.muted").first().waitFor({ timeout: 30000 });
ok(await cmp.locator(".receipt").count() > 0, `compare: ${await cmp.locator(".side-by-side .col").count()} column(s), ${await cmp.locator(".receipt").count()} receipt(s)`);

await p.waitForLoadState("networkidle"); await p.waitForTimeout(2000); // let the compare page finish its refresh
await go("/m/shetty-v-oberoi/brief");
const btn = p.locator("button:has-text('Prepare the brief'), button:has-text('Make it again'), button:has-text('Update the brief')").first();
await btn.click();
await p.locator(".agent-steps.live li").first().waitFor({ timeout: 60000 });
await p.waitForFunction(() => !document.querySelector(".agent-steps.live"), null, { timeout: 290000 });
await p.waitForLoadState("networkidle"); await p.waitForTimeout(3000); // the page refreshes itself when the brief is saved
const secs = await p.locator(".brief-section").count();
ok(secs === 3 && await p.locator(".brief-section .receipt").count() > 0, `brief: ${secs} sections, ${await p.locator(".brief-section .receipt").count()} receipts`);
ok(await p.isVisible("text=Copy brief"), "brief can be copied");
await b.close();
