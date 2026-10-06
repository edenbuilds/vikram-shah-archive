// Launch chromium, webkit or firefox for the checks. 06-10-2026: the installed Playwright wanted browser builds that were not
// downloaded (chromium 1243, webkit 2359, firefox 1543) while older ones were, so a plain launch() failed. Falls back to the
// system Chrome and to whatever build is in the Playwright cache, instead of downloading anything.
import { chromium, webkit, firefox } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
const CACHE = `${homedir()}/Library/Caches/ms-playwright`;
const newest = (prefix) => (existsSync(CACHE) ? readdirSync(CACHE).filter((d) => d.startsWith(prefix + "-")).sort().pop() : undefined);
const TYPES = { chromium, webkit, firefox };
export async function launch(name) {
  try { return await TYPES[name].launch(name === "chromium" ? { channel: "chrome" } : {}); } catch (e) { if (process.env.DEBUG_BROWSERS) console.log(String(e.message).split("\n")[0]); }  // fall through to a cached build
  const dir = newest(name);
  const exe = name === "webkit" ? `${CACHE}/${dir}/pw_run.sh` : name === "firefox" ? `${CACHE}/${dir}/firefox/Nightly.app/Contents/MacOS/firefox` : undefined;
  if (!exe || !dir) throw new Error(`No ${name} build found. Run npx playwright install ${name}.`);
  return TYPES[name].launch({ executablePath: exe });
}
