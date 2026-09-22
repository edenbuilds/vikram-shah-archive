# Case Companion: handoff

This is a private workspace for Arya (an advocate) and her case papers. Every answer comes with a receipt: the paper, the page and the exact words. If the papers don't say it, the app says "not found". It never offers theories.

- **Live site:** https://case-companion.edenbuilds.me. It is a Vercel project named `case-companion`, pinned to region bom1.
- **Database:** Supabase project `rcynnecqcxnlbbvmvimb`, in Mumbai. Access is controlled by row-level security on matter membership.
- **Repo:** `edenbuilds/vikram-shah-archive`, folder `companion/`, branch main.
- **Keys and links:** kept outside the repo in `~/Downloads/case-secrets-env/case-companion-keys.md`. That file holds the MCP URLs and each person's sign-in link.

## State as of 22-09-2026

Everything below was verified on the live site on this date.

| Area | Result |
|---|---|
| Login and logout | Signing in with the personal link works; the sign-in page has no password field; signing out works; private pages redirect to the login page. |
| Database security | With the anonymous key, every table returns `[]`. A forged MCP token gets 401. |
| Ask | The answer carries receipts, all from the chosen paper. With no source picked, questions outside the papers get "Not found". |
| MCP | All tools work (`scripts/mcp-smoke.ts`). `ask_papers` uses the receipts agent. |
| Upload, OCR and filing | Browser upload creates a queued job. The worker reads the text and files the paper. |
| Downloads | The PDF's SHA-256 matches the stored file. The Word file is a valid .docx. The Markdown and text files contain every page. |
| ZIP export | Built in the browser for the Patil matter: 96.6 MB, 101 entries, valid. |
| Responsiveness | No sideways scroll on 13 pages each on iPhone 13, iPad Pro 13 (portrait and landscape) and a 1440px desktop, in WebKit. |
| Folders and archive | Both work and survive a reload. |

Workspace state:
- The 6 uploaded documents are filed as 89 papers (2,114 pages), plus the Vikram Shah matter.

Notifications are **muted**:
- `NOTIFY_MUTED=1` is set in `.env.local`, which the worker reads when it starts. Omkar asked for the Ready and Couldn't-file messages to stop because test uploads were sending them to everyone.
- To turn them back on, remove that line and run `launchctl kickstart -k gui/$(id -u)/me.edenbuilds.case-companion-worker`.
- `scripts/e2e.mjs` only sends the sign-in email when `E2E_SEND=1` is set.

### Later on 22-09-2026 (verified live)

- **Index split fix (WP 811/2024, Kanojiya):** only 3 of 8 exhibits were filed. The model placed all of them, but `proven()` in worker/volume_index.py checked the first 300 raw characters, and pdftotext pads scanned pages with spaces. It now checks the whitespace-collapsed text the model saw. The last index row no longer swallows a separately bound compilation (the SRA reply). A failed split now takes back the papers it already filed. The volume was re-filed as 20 papers; `worker/test_volume_index.py` covers both cases.
- **Old papers:** the 18 papers from the two earlier runs are still in that matter, next to the correct 20. They are waiting for Omkar's OK before they are deleted (nothing references them).
- **Uploads:** 6 MB pieces, each retried up to 5 times, with a percentage and progress bar. The 70 MB live test went from 7% to 99% and was queued.
- **Editing:** "Edit details" under a matter's title (case name, short name, forum, cause) and "Rename" under a paper's title, both in an in-app dialog.

## How it fits together

- **Web app:** Next.js 15 App Router, React 19 and `@supabase/ssr`.
  - Pages: the workspace `/`, a matter `/m/[matter]`, a paper reader `/m/[matter]/d/[doc]`, Ask `/ask`, `/settings` and upload `/m/[matter]/upload`.
  - Sign-in link `/k/<token>`: the token is an HMAC made with `COMPANION_LINK_SECRET`, and the helpers are in `lib/access.ts`.
- **Ask agent:** `lib/agent.ts`, using gpt-5.5 through the Responses API. It can search, read pages and give a final answer.
  - Every quote is checked in code against the page text (`lib/citations.ts verify()`).
  - A quote that fails is sent back for one repair round, then withheld.
  - `lib/scope.ts` works out which matter or paper a message refers to.
- **MCP:**
  - Server: `app/api/mcp/[token]/route.ts`, with the tools in `lib/mcp.ts`.
  - The guide agents read first is `lib/agent-readme.ts`. It includes a live workspace section, and `lib/agent-readme.test.ts` keeps it in step with `public/skill/case-companion/SKILL.md`.
- **Telegram:** `@arya_case_archivebot`, handled by `app/api/telegram/[secret]/route.ts` with helpers in `lib/telegram.ts`.
  - It handles files, questions (answered with receipts and page scans), `/note`, `/matters`, `/status` and `/link`.
  - Chats are linked through the `TELEGRAM_USERS` env var and `_system/telegram-users.json` in storage.
- **Worker:** runs on this Mac as the LaunchAgent `me.edenbuilds.case-companion-worker`, which runs `worker/worker.py`. Its log is `~/Library/Logs/case-companion-worker.log`.
  - It polls `ingest_jobs` and rejoins uploads that arrived in chunks (needed because of the 50 MB storage cap).
  - It reads the text with Google Vision, 6 pages at a time.
  - It splits volumes using the volume's own index (`worker/volume_index.py`), then embeds the text into chunks.
  - Notifications come from `worker/notify.py` and only go to members of that matter.
- **Per-person arrangement** (folders, archive): stored at `_system/prefs/<hash>.json`. It is read fresh with `readState`/`writeState` in `lib/access.ts` because the storage CDN served stale copies.

## Env vars (`companion/.env.local`, and the same set in Vercel)

`OPENAI_API_KEY SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY COMPANION_LINK_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_USERS RESEND_API_KEY AGENTMAIL_API_KEY NOTIFY_EMAILS NOTIFY_MUTED`

These keys were pasted in chat earlier, so rotate them: OpenAI, Supabase service role, Telegram, Resend.

## Tests

The `<link>` in the commands below is Omkar's sign-in link from the keys file.

```bash
cd companion && npm run typecheck && npm test && npm run build
node scripts/e2e.mjs https://case-companion.edenbuilds.me <link> <small.pdf>
node scripts/responsive-check.mjs https://case-companion.edenbuilds.me <link> <shots-dir>
node scripts/zip-check.mjs https://case-companion.edenbuilds.me <link> <matter> "" <out-dir>
node --env-file=.env.local --experimental-strip-types scripts/mcp-smoke.ts https://case-companion.edenbuilds.me omkar1sonawane@gmail.com
node --env-file=.env.local --experimental-strip-types scripts/agent-test.ts
npm run eval:qa
```

Two scripts, `scripts/telegram-e2e.mjs` and `telegram-note-test.mjs`, message real chats. Run them only on purpose.

## Deploy

```bash
cd companion && grep -o '"projectName":"[^"]*"' .vercel/project.json   # must say case-companion
git -c user.email=omkar1sonawane@gmail.com commit ... && git push origin main && vercel deploy --prod --yes
```

Do not touch any other edenbuilds.me subdomain, or the "SHB Legal - Affiniti" Supabase project.

## Open items

- **Supabase free plan:** each file is capped at 50 MB. Uploads work around it by sending 6 MB pieces that the worker joins. Moving to Pro would remove the cap; that is Omkar's call.
- **Telegram:** files over 20 MB can't be fetched by the bot, so they need the web upload.
- **Test matter:** `zz-upload-test` collects e2e uploads. Delete it when testing stops.
- **Key rotation:** see Env vars above.

## Paste-ready prompt for the next agent

> Work in /Users/omkar/vikram-shah-archive/companion (Case Companion, live at case-companion.edenbuilds.me). Read HANDOFF.md first. Rules:
> - Never invent data; every statement needs a receipt (paper, page, verbatim quote), and never offer theories.
> - No emojis, no em dashes, no wand or glitter icons, and never the word "AI" in the UI.
> - Dates are DD-MM-YYYY in IST.
> - Notifications stay muted unless Omkar says otherwise.
> - Don't run the Telegram test scripts without asking.
>
> Before deploying:
> - run typecheck, npm test, build, and e2e.mjs and responsive-check.mjs against the live URL;
> - confirm the Vercel projectName is case-companion;
> - commit as omkar1sonawane@gmail.com.
>
> Task: <describe it here>.
