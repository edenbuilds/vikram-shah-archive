// The app as she uses it, in WebKit against a live base URL.
//   node scripts/e2e.mjs <base> <signin-link> <pdf-to-upload>
import { webkit } from "playwright";
const [base, link, pdf] = process.argv.slice(2);
const b = await webkit.launch();
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
const go = async (p, path) => { for (let k = 0; k < 3; k++) { try { return await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 }); } catch { await p.waitForTimeout(2000); } } };

// 1. signed out
let ctx = await b.newContext(); let p = await ctx.newPage();
await go(p, "/"); ok(await p.isVisible("text=The papers, read to the page."), "signed out: landing page");
await go(p, "/m/shetty-v-oberoi"); ok(p.url().includes("/login"), "signed out: private page redirects to sign-in");
// 2. sign-in page (no password field; sends a link)
ok(!(await p.$("input[type=password]")), "sign-in page has no password field");
await p.fill("input[type=email]", "omkar1sonawane@gmail.com"); await p.click("text=Email me a sign-in link");
await p.waitForURL(/sent=/); ok(await p.isVisible("text=a sign-in link is on its way"), "sign-in link requested");
// personal link signs in
await p.goto(link, { waitUntil: "networkidle" }); await go(p, "/");
ok(await p.isVisible("text=Your matters"), "personal link signs in");
ok(await p.isVisible("a[aria-label=Settings]") && await p.isVisible("button[aria-label='Sign out']"), "header: Ask, Settings, Sign out");
ok(!(await p.content()).includes("Connect AI"), "no 'Connect AI' wording");

// 3. folders and archive (on the test matter)
const card = p.locator(".matter-wrap", { hasText: "zz Upload test" });
await card.locator("summary").click({ force: true }); await card.locator("input[name=folder]").fill("Tests");
await card.locator("button[value=save]").click({ force: true });
ok(await p.locator(".folder-title", { hasText: "Tests" }).waitFor({ timeout: 30000 }).then(() => true, () => false), "matter filed into folder 'Tests'");
await p.waitForTimeout(900); // let the card finish arriving in its folder
const card2 = p.locator(".matter-wrap", { hasText: "zz Upload test" });
if (!(await card2.locator("details.organise").getAttribute("open") !== null)) await card2.locator("summary").click({ force: true });
await card2.locator("button[value=archive]").click({ force: true });
await p.locator("details.archived").waitFor({ timeout: 30000 }); await p.waitForTimeout(900);
await p.click("details.archived > summary");
ok(await p.locator("details.archived .matter-wrap", { hasText: "zz Upload test" }).count() === 1, "archived matter shows under Archived");

// 4. upload through the page
await go(p, "/m/zz-upload-test/upload");
await p.setInputFiles("input[type=file]", pdf);
await p.click("button:has-text('Upload 1 file')");
const queued = await p.locator(".queue li", { hasText: "e2e-upload.pdf" }).first().waitFor({ timeout: 180000 }).then(() => true, () => false);
ok(queued, "upload queued through the upload page");

// 5. Ask with one chosen paper
await go(p, "/ask?m=shetty-v-oberoi");
await p.locator("details.sources > summary").click();
await p.locator("label.src", { hasText: "Application seeking withdrawal" }).locator("input").check();
await p.fill(".askbox textarea", "Why is the appeal being withdrawn?");
await p.click(".askbox button.btn:not(.ghost)");
await p.waitForSelector(".receipt, .refusal", { timeout: 240000 });
const receipts = await p.locator(".receipt").count();
const cites = await p.locator(".receipt cite").allTextContents();
ok(receipts > 0 && cites.every((c) => c.includes("withdrawal")), `Ask answered with ${receipts} receipt(s), all from the chosen paper`);

// 6. sign out
await p.click("button[aria-label='Sign out']"); await p.waitForURL(/login/);
await go(p, "/settings"); ok(p.url().includes("/login"), "signed out after Sign out");
await b.close();
