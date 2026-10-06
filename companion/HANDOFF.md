# Case Companion: handoff

This is a private workspace for Arya (an advocate) and her case papers. Every answer comes with a receipt: the paper, the page and the exact words. If the papers don't say it, the app says "not found". It never offers theories.

- **Live site:** https://case-companion.edenbuilds.me. It is a Vercel project named `case-companion`, pinned to region bom1.
- **Database:** Supabase project `rcynnecqcxnlbbvmvimb`, in Mumbai. Access is controlled by row-level security on matter membership.
- **Repo:** `edenbuilds/vikram-shah-archive`, folder `companion/`, branch main.
- **Keys and links:** kept outside the repo in `~/Downloads/case-secrets-env/case-companion-keys.md`. That file holds the MCP URLs and each person's sign-in link.

## 06-10-2026: report a problem, and control over connected apps

- **Report a problem** (`components/Report.tsx`, `lib/reports.ts`, `app/api/report/route.ts`, Settings, Problems). Double click or double tap, press and hold, or a firm press on EMPTY space shows "Report a problem here". Buttons, links and fields keep their own gestures, so the account menu's "Report a problem" first asks her to choose what is wrong (the click is swallowed, so a broken button can be pointed at without pressing it), or "Whole screen". Kinds: Looks wrong, Does not work, Feature, Other. The report keeps the page, the element, her device, the last console errors (a toast error she saw counts), failed requests, and a viewport screenshot (html2canvas-pro; the copy has animations stopped and closed `<details>` hidden, or the page came out blank). It is emailed from `accounts-eden@agentmail.to` (the plan allows 3 inboxes and all are used; that inbox only sends) to omkar1sonawane@gmail.com as a brief for Claude Code, and every report stays in Settings, Problems with the picture, Copy the brief, Mark fixed, Resend and Delete. Needs `AGENTMAIL_API_KEY` (set in Vercel production). 10 reports per hour per person.
- **Connected apps** (Settings, Connected apps; `lib/mcp-control.ts`, `lib/mcp-writes.ts`, `lib/mcp.ts`). The SERVER decides what a write does, per person: Ask me first (default, the change waits and she approves, edits or declines it), Allow with undo (saved and logged with an Undo), Read only (every write refused). `confirm: true` no longer saves by itself in the default mode, so replies say "NOT SAVED YET". Forgetting a memory moves it to Recently forgotten for 30 days. Approve all and Decline all appear when more than one change waits (page corrections are never approved in bulk). The Settings chip shows how many wait; the home page links to them.
- **Wording:** the UI never says "AI". Say apps or agents. Old stored activity text that says "AI app" is read as "A connected app" (`lib/activity.ts`).
- **Skills and the agent guide** (`skills/`, `lib/agent-readme.ts`) describe the three modes and what each reply means. The reading-order export and its skill no longer use em dashes.
- **Checks:** `node --experimental-strip-types --test lib/*.test.ts` (68), `scripts/mcp-control-check.ts` and `scripts/mcp-annotate-check.ts` (`--env-file=.env.local --experimental-strip-types <base> <email>`, both put her mode and log back), `scripts/report-check.mjs <base> check|send` (`send` files one real labelled test report and emails it), `scripts/control-ui-check.mjs <base>` (also asserts no screen says AI). `scripts/browsers.mjs` launches system Chrome and the cached WebKit and Firefox builds.
- **Open bug, not fixed:** on /settings, Firefox and WebKit (Playwright) sometimes log React error #418 followed by `$RS ... b.parentNode` of null; it is all-or-nothing per browser session, never seen in Chromium, and the page still works because React falls back to client rendering. Seen on live and once locally (`next start`), not in `next dev`. The page streams 13 outlined segments (about 100 KB: `$RS("S:1","P:1")` at about 63 KB, inside the `loading.tsx` boundary), so hydration likely meets the `<template id="P:1">` placeholder before the segment is swapped in. It surfaced because `report-check.mjs` asserts "no page errors", which no check did on Settings before. Try: split Settings so the heavy sections (Memory, Skills, Problems) sit in their own Suspense, or shrink what Settings renders; confirm with `scripts/report-check.mjs <base> check 'firefox|iphone'` several times.
- **Device matrix (done, live):** `scripts/responsive-check.mjs <base>`, 14 device and browser sizes (iPhone 13 and SE, Pixel 7, Galaxy Tab S4, iPad 820, iPad Pro 11 and 13 in both orientations, MacBook Air and Pro 16, Windows laptop 1366 and 1536, Chromium, WebKit, Firefox) over 27 pages: no sideways scroll after the wrap fixes. Emulated, not real devices.
- **Not done:** the Arc UI and React Bits polish pass. Coverage so far is emulated Chrome, WebKit (iPhone, iPad Pro 13) and Firefox, not real devices.

Paste-ready prompt for the next agent: "Read companion/HANDOFF.md and DESIGN.md. Run the four checks above against the live site. Then fix the Settings hydration bug above, check tap targets under 44px, and add at most two free React Bits micro components where they are clearly better. Keep DESIGN.md: radius 4px or less, no shadows, gradients, status pills, emojis, em dashes, or the word AI on screen."

## 05-10-2026: garbled page text and Kimi JSON

- **What broke.** Faheem complaint p.6 showed ragged one-word lines. The scan was clean; LlamaParse misread it and, being the first engine to answer, won. The chain had no quality check.
- **Gate.** `worker/ocr_quality.py` (`measure`, `score`, `poor`: share of dictionary words, share of lines of two words or fewer). `vision()` in `worker/worker.py` tries the next engine when a read is poor and keeps the preferred engine's read unless a later one scores 0.15 higher (tables and survey lists are ragged by nature). Tested in `worker/test_ocr_quality.py` and `test_worker.py`. Restart the launchd worker to pick it up.
- **Repair.** All 11,457 pages were measured; 2,090 candidates were re-read with Google Vision (Tesseract where that was poor too). 162 pages that the gate called broken, or that had no text and now read, were replaced through `correctPage`, so each is reversible in the page's history (via "ai", by "OCR re-read"). Pages with highlights on their words were skipped (none were). About 669 candidates have no machine-readable text at all (blank, drawings, handwriting) and stay as they are. About 1,300 pages still trip the gate; nearly all are tables, survey plans and lists that Google already read.
- **Kimi JSON.** Reproduced: long answers hit the 8,000-token ceiling and were cut mid-string, and the old first-"{"-to-last-"}" cut passed the fragment on. `lib/ai.ts` now `extractJson` (walks the object by its brackets, ignores prose braces, repairs raw line breaks in strings and trailing commas), and `call()` asks again with 32,000 tokens when a JSON answer stops at `max_tokens`, then falls to the next model. `worker/volume_index.py` has the same extractor (`extract_json`) and refuses a cut-off reply. Tests: `lib/converse.test.ts`, `worker/test_volume_index.py`. Live: a 12-part and a 25-part explainer both parse now.
- **Not committed:** `scripts/tmp/*` (re-read driver, decisions, apply). To redo a repair: `reocr.py`, `decide.py`, then `apply.ts apply`.

## 04-10-2026 (night, later): logo, social preview, greeting, loading, share, touch

Shipped (deployed to case-companion.edenbuilds.me; see DESIGN.md "Mark, greeting, loading, share, touch"):
- New mark (`components/Logo.tsx`), tab icon, `favicon.ico`, iOS and install icons, manifest, Open Graph and Twitter image, robots.txt, per-page titles ("Paper title · Case Companion"). The icon, preview and manifest routes are public in `middleware.ts` (a chat app has no session). All pages stay noindex.
- Home greets "Hello, <first name>" (`lib/name.ts`). `app/loading.tsx` is the loading page, `error.tsx` and `not-found.tsx` carry the mark.
- `components/ShareMenu.tsx` on matter, paper and explainer. `components/Touch.tsx` + `lib/haptic.ts`: touch ticks, press and hold menu, double-click or double-tap to edit, board column double-click. A "Touch feedback" switch sits in Settings, Display.
- Check: `node scripts/polish-check.mjs <base> "$LINK"` (no secrets printed; it removes what it adds).

Not verified: haptics on a real phone (Android uses `navigator.vibrate`; the iPhone path toggles a hidden `switch` input, iOS 17.4 and later, untested on a device); the native share sheet (the menu shows Share only where `navigator.share` exists); the OG preview inside WhatsApp or Slack; `scripts/liquidtext-check.mjs` live (the last run lost its network connection mid-run, the two uploads before it passed).

## 04-10-2026 (night): everything saves itself, colour, highlights both ways, readable tables

Shipped (commit `dc82bf9` and the HANDOFF commit after it; deployed to case-companion.edenbuilds.me):
- **Board**: mouse drag and keyboard move fixed in `components/ui/kanban-board.tsx` (column under the pointer, a `live` ref so a drop never reads a stale board). Click a task title to rename it.
- **Studies save themselves** (`app/api/study/route.ts`, `lib/jobs.ts`, `components/JobWatcher.tsx`): an explainer or brief runs under `after()`, writes a job record, and saves whoever started it and wherever they go. A toast with a link appears when it finishes (`GET /api/study/jobs`).
- **Memory is automatic**: `track()` in `lib/activity.ts` is called from every server action and from MCP reads (get_paper, read_pages, ask_papers, search_papers). The MCP `initialize` instructions open with "Where she left off".
- **Toasts** on every server action (the `fetch` wrapper in `components/Toast.tsx` spots `Next-Action` calls), with tones. **Colour**: per-tab and per-stat hues, nav icon hues. **Nav**: the pill rests on the current page and glides 380 ms; hover only washes.
- **Editable**: notes (edit in place), highlights, her note under each explainer and brief part (`components/SectionNote.tsx`, `lib/study.ts` `saveSectionNote`), board task titles. Stat tiles are links.
- **Highlights**: select words for five colours, draw on the scan; both are `annotations` rows tagged `highlight` and `color:#hex` (a drawn one also `drawn`, with its shape in `<matter>/pages/<doc>/ink.json`, `lib/ink.ts`). The PDF-with-notes export writes them as real PDF Highlight annotations; uploaded PDF and LiquidText highlights come back as the same rows. **MCP**: `add_note` takes `highlight: true`, `colour`, and `bookmark: true` (asks first, `confirm: true` saves).
- **Explainer**: each sentence and number opens the paper at the cited page; each footnote also opens the PDF at that page (`#page=N`). A name the paper spells differently from the matter (`lib/spelling.ts`) is shown as filed with a line saying so. The Statement of Claim itself prints "Mr. Vikarm Shah" (checked on the scan), so the record is never corrected.
- **Paper text**: a block with a gap of 3+ spaces or a tab is kind `spaced` (`lib/transcript.ts`): the stored text is untouched, each gap is drawn as a hairline, rows wrap like prose (`.b-spaced`). Pipe tables stay fixed-width.
- **Emails** (`lib/signin-mail.ts`, `worker/notify.py`) follow the cream, violet and 4px design.

Verified locally on a production build: lib tests 48/48, `tsc` clean, `scripts/inapp-check.mjs` all PASS, `scripts/mcp-annotate-check.ts` all PASS (also against production), `scripts/mcp-smoke.ts` (the two `isError` lines are the expected refusals).
Live (04-10-2026): `inapp-check` 26 PASS, `board-check` 9 PASS, `mcp-annotate-check` all PASS, `responsive-check` no sideways scroll on 26 pages across iPhone, iPad Pro 13 (both ways) and desktop.

**Open:**
- Not tested: highlighting a selection that crosses a column gap in a `spaced` row (the offsets come from the same text nodes as before, so they should hold, but no check covers it).
- The paper page does not yet scroll to or mark the exact quoted words when it opens from an explainer link (it opens the right page).
- The `.ltproj` writer is still not offered (private format).
- The scratch folder `scripts/tmp` is git-ignored: `zz-lt-project.ltproj` and `zz-lt-folder.ltproj.zip` there are the fixtures for `scripts/liquidtext-check.mjs`.

## 04-10-2026 (late): memory, sign-in, Intercom design, board, accessibility

Shipped (deployed to case-companion.edenbuilds.me; build and 41/41 lib tests green):
- **Automatic memory** (`lib/activity.ts`): visits, uploads, notes, questions, hearings, filed papers and pins merged into a per-person timeline (`_system/activity/*.timeline.json`, 300 kept). Shown on home ("Pick up where you left off", Recent activity), in Settings > Memory, in Ask's context, and in MCP `read_me_first` / `get_memory`, always labelled "not facts from the papers".
- **Sign in**: `components/ui/sign-in.tsx` (21st.dev SignInPage ported to plain CSS), email link only, the supplied video on the right. `app/Entry.tsx` deleted.
- **Design**: DESIGN.md v2 (Intercom warm cream, 4px corners, hairlines). Newsreader 500 headings, Switzer UI, IBM Plex Mono labels. Omkar then asked for colour, not black: primary buttons, toasts and the brand mark are violet `#0007cb`; matter kinds have colours (writ violet, arbitration amber, RERA green, civil terracotta) on tags and card top borders; board columns are tinted by stage; hearings this week get an amber wash.
- **Explainer**: one sentence per row with violet receipt chips (superscripts no longer push lines apart).
- **Board** at `/board` (List | Board switch on home): `components/ui/kanban-board.tsx` on dnd-kit (mouse, touch with a 180ms press, keyboard). State lives in `lib/board.ts` (reconcile/move, tested) and `lib/board-store.ts` (server only, `_system/board/*.json`), saved by `app/board/actions.ts`, which re-checks matter ids.
- **Display and accessibility** in Settings (`components/A11yPrefs.tsx`): text size, line spacing, reading font, weight, contrast, motion, link underlines. Kept per device, applied before paint.
- Phone account menu no longer sits under the nav row. Headings and prose use text-wrap balance/pretty (no widows).

Verified: `scripts/board-check.mjs` (system Chrome) passed for: four columns render, a dropped card does not open the matter, add a task survives a reload, hold to remove, iPad touch drag survives a reload, no sideways scroll on iPad landscape. Responsive check passed 24 pages x 4 devices before the board and the colours. The live login serves the video.

**Open at that time (all resolved in the night section above):**
- `scripts/board-check.mjs`: the **mouse drag** and **keyboard move** checks FAILED (no toast, column unchanged after a reload). Debug with a mid-drag screenshot: is `.is-lifted` present, which `over` id fires? Suspects: `onDragOver` moving the card before `onDragEnd` reads `board` from a stale closure, and `closestCorners` picking the source column. Consider reading from a ref in onEnd.
- The colour pass and the board are not re-checked on all devices: run `scripts/responsive-check.mjs` (add `/board`) and look at the phone, iPad 13" portrait and landscape screenshots.
- Test memory end to end: open a paper, then MCP `get_memory` and `read_me_first` should list it under "Where she left off".
- `scripts/liquidtext-check.mjs` needs a re-run with its fixtures (the last run was queued behind Hazel).
- The changes from this section are not committed if the commit below failed; check `git log -1`.

## 04-10-2026 (final): notes in every format, no size cap, lossless shrink, the redesign

**What shipped**
- Her reading work comes in with the paper:
  - PDF outline and Highlight/Text annotations.
  - LiquidText projects: documents, highlights, tags, pen and highlighter ink, read by `worker/pdf_notes.py`.
  - Highlighter strokes without text get the verbatim transcript words under them, or no quote at all.
- Bookmarks | Annotations panel (PDFgear layout), ink drawn on the scan, PDF-with-notes export (Highlight, Square for pen, Text, outline) that round-trips.
- No size cap: objects over 40 MB are pieced (`worker/corpus.py storage_put`, `lib/pdf-file.ts`), and downloads fall back to a browser joiner page.
- Lossless shrink on every paper (OCRmyPDF -O1 + jbig2 or qpdf). It is kept only if the page pixels, the text and the outline are identical; the upload is always kept in `originals/`.
- Index split on Bedrock Converse (`LLM_MODEL=bedrock:…kimi-k3@flex`; no temperature field, JSON in the system prompt, blank text blocks skipped). `slice_pdf` uses one qpdf call (Hazel's 628 pages hit "Too many open files").
- Chunk writes that hit Postgres statement timeout 57014 are halved and retried (`corpus.post_chunks`; Hazel failed at 628/628 before this).
- Redesign per `DESIGN.md`:
  - Gleap tokens, Fraunces plus self-hosted Switzer, light only.
  - Pill nav: a second header row on a phone, not fixed to the bottom.
  - Sliding matter-tab underline; the Aurora entry page (sign in and front door).
  - React Bits micro components (RubberSegment, HoldButton, StatusMark, LatticeLoader) in `components/rb`.
  - Toasts after confirmed saves, skip link, focus rings, page entrance.
- Docs: `docs/PRODUCT-PRD-notes-and-formats.md`, `docs/TECH-PRD-notes-and-formats.md`, skills `notes-and-bookmarks` and `liquidtext-bridge`, and the rebuilt `public/skill/case-companion.zip`.

**Verified 04-10-2026**
- tsc, 38/38 unit tests, build, worker self-checks (pdf_notes 15/15, test_worker including the chunk halving), test_volume_index.
- responsive-check: 24 pages x 4 devices, no sideways scroll. Entry and app pages checked at 390, iPad Pro 1032 and 1440: video plays, nav never overlaps Ask.
- mcp-smoke against live: every tool answers; verify_quote VERIFIED and NOT FOUND both right; the off-corpus question says "Not found in the papers on file" but took 69 s (the client default timeout is 60 s).
- Juhi and WP filed with bookmarks, notes and ink; export round trip 31/31 shapes.

**Open**
- Hazel refile (628 pages, 107 MB to 83 MB lossless, index split) was still writing parts at handoff time; check the `ingest_jobs` row.
- liquidtext-check live re-run was queued behind Hazel on the single worker.
- Off-corpus Ask is slow (69 s). Cap the agent loop's searches if a client times out.
- `.ltproj` writing is deliberately not offered (private format, can't be verified without LiquidText).

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

## 24-09-2026 (later)

New, verified on the live site unless marked:

- **Any format uploads** (`worker/worker.py as_pdf`). Everything becomes a PDF before reading:
  - PDFs as they are (also a .pdf with a few bytes before `%PDF-`, which used to fail as "Can't read .pdf files yet");
  - photos (JPG, PNG, HEIC, TIFF, GIF, BMP, WebP) through `sips`;
  - Word, RTF, ODT and HTML through `textutil`, then printed by headless Chrome;
  - Markdown, text and CSV printed as written.
  - A zip is opened in the browser (and by the Telegram bot), and each readable file inside is queued as its own paper; the rest are named and skipped.
  - Checked live with .md, .txt, .docx, .png, .heic and a zip in zz-upload-test: all filed, text verbatim.
- **"Add another document?"** After an upload the page asks, in the page itself; "Add another" opens the file picker. The Telegram bot ends its "Queued" message with the same offer.
- **Last updated** (latest paper filed, DD-MM-YYYY, HH:MM IST) in every matter's header.
- **Reading order** tab (`/m/<matter>/reading`, `lib/reading.ts`). Her reading-order-chronological-md skill, kept to receipts:
  - every paper by its own date, grouped by year, undated last;
  - What it is, What it says, What it sets up, Importance.
  - Every field has a verbatim quote that is checked in code; a field that fails shows "Not found in the papers on file".
  - Her skill's "Implication" (strategy) becomes "What it sets up": only what the paper itself directs.
  - "Mentioned in the papers, not on file" is tiered like her Documents Still Needed, each with the quote that mentions it.
  - One model call per paper, kept per paper, so after an upload only the new papers are read.
  - Copy and Save .md export in her skill's layout. Made for every matter.
- **Docs follow new papers.** When a matter's upload queue empties, the worker asks the app (`/api/study`, signed as `worker@case-companion` with the link secret) to update the dates list, reading order, explainer and brief. Only aids she already made are updated. The "new papers" banners stay as a fallback if an update fails.
- **Skills.** The MCP has `list_skills`, `get_skill` and `reading_order`, plus a `reading_order` prompt.
  - Built-in skills live in `companion/skills/<name>/SKILL.md`.
  - She can add her own on Settings, Skills: a SKILL.md, some Markdown files or a zip of a skill folder. They are stored in `_system/skills/` and can be removed there with an in-page confirm.
  - Rule 10 in the guide and SKILL.md: name the matching skill and ask before using it. A skill shapes the work, never its facts.
- **Speed.**
  - Printed page numbers are kept in memory on a warm server.
  - The idle worker runs a vector query every 5 minutes, because the first search after an idle spell took 8 s on a cold index.
  - Telegram shows typing at once, then a progress line that updates while it reads; page scans are fetched in parallel.
- Checks: `node scripts/study-e2e.mjs` now covers the reading order, upload formats and the header; `scripts/responsive-check.mjs` includes the reading pages and Settings, Skills.
- **Models (25-09-2026):** reading orders run on DeepSeek `deepseek-flash` (`READING_MODEL`, `DEEPSEEK_API_KEY`); drafting, Ask and Telegram run on xAI `grok-4.3` (Vercel env `LLM_MODEL`; `deepseek-*` names route to DeepSeek with `DEEPSEEK_API_KEY`). DeepSeek V4.1 Flash was tried and not adopted: it passed `scripts/agent-test.ts` 5/5, but on multi-claim Compare (`scripts/tmp/cmp.ts`) it kept verified claims in 3 of 9 runs against 4 of 5 for grok-4.3, usually by quoting spans too short to carry the dates and numbers it claimed, then giving up. The Ask loop resends the transcript each turn and never forces a tool call, so both providers work. Volume indexing (worker, vision) stays on xAI. Embeddings stay on OpenAI `text-embedding-3-small`, which has no credit yet: new uploads file with empty vectors, search uses exact words, and the idle worker fills the vectors once credit is added. Whole-matter Ask is weaker until then.
- **Kamble (Mulshi) recovered (25-09-2026).** All 55 uploads had failed on 24-09 (53 on OpenAI credit, 2 on non-ASCII storage names). They were re-filed with `scripts/tmp/refile_matter.py <matter>` (force past the same-bytes check): 55 papers, 619 pages, 893 passages, reading order 55 entries. Vectors are empty until OpenAI credit is added.
- **Scans filed without text (29-09-2026).** The worker restarted while the Mac was offline, got no Google Vision token, and kept running with OCR off, so Khadka (230 pp.), Sunita Patil (512 of 693 pp.) and Kalpataru part 7 (105 of 106 pp.) were filed as "done" with empty pages and no index split. The worker now re-tries Vision before claiming each job and leaves jobs queued while OCR is down. Recovery: `python3 worker/worker.py --refile <job id>`. A refile that now splits the volume leaves the old one-piece paper behind, so delete it after checking the new papers.
- **Network drops mid-volume (30-09-2026).** DNS dropped for minutes and killed the Kalpataru refile twice. `corpus._req` now retries network errors for ~5 minutes (HTTP 5xx keeps its short budget). Khadka, Sunita and Kalpataru were re-filed with text and their old empty copies deleted. Kalpataru was then filed again from Omkar's 39 MB compressed copy as one 748-page paper with its PDF stored, and the 7 size parts removed. Shri Sati's three uploads (29-09) had also been filed with no text and were re-filed. Jay Hiren Gandhi's 57 MB revision application never reached storage from the browser; it was uploaded in 6 MB pieces from the Mac and filed (241 pp., 3 parts). Mundargi's upload is itself a 15-page "Print To PDF"; the rest of the volume needs the full file.
- **Dead PDF downloads (30-09-2026).** Uploads over 6 MB arrive as `.partNNN` pieces, and papers under 45 MB pointed `pdf_path` at a whole object that never existed. The worker now stores rejoined uploads whole; 4 papers were backfilled (Mundargi, Vikram Singh appeal, Kamble 7/12 extracts, SATI).
- **Phones (30-09-2026).** The MCP URL works as a no-auth remote connector (Streamable HTTP, `search` and `fetch` included for ChatGPT). Add it once on the web (claude.ai Settings > Connectors > custom connector; ChatGPT developer-mode connector with no auth) and it follows the account to the phone apps. Each person uses their own URL from the keys file; never put it in a repo `.mcp.json`.
- **Paper ids across matters (30-09-2026).** Ids are slug + file hash, so the same PDF filed in a second matter used to take the first matter's paper. `corpus.doc_id` now gives it a matter-suffixed id instead. Use a synthetic `e2e-upload.pdf` for `scripts/e2e.mjs`, never a real paper.
- **Test papers.** zz-upload-test now holds 8 extra test papers (note-md-test, plain-text-test, word-test, photo-png-test, photo-heic-test, zipped-md-test, zipped-txt-test, incremental-test). They can go whenever the test matter is deleted.

## 24-09-2026

New, verified on the live site unless marked:

- **Explainer** (`/m/<matter>/explainer`, first tab after Papers). Five parts, in the shape of the Agile explainer Arya's Claude made: what kind of case it is, the ladder of authorities, the papers in the file, the story in date order, a summary table. Each part is one run of the receipts agent (`EXPLAINER` in `app/api/study/route.ts`); every sentence is footnoted to paper, printed page and quote. Unlike her PDF, nothing comes from general knowledge. Made for all 8 matters that have papers. It asks before remaking when new papers arrive (the matter page and the explainer page both ask). Copy and Save .md.
- **Her Agile explainer PDF** is kept at `companion/_system/study/<agile>/explainer-yours.pdf` and linked as "Your explainer (PDF)" on that matter's explainer page. It is not filed as a paper, so it never shows up as the record.
- **Printed page numbers** (`lib/printed.ts`). A paper book's own page number often differs from the PDF page: Agile PDF p. 350 is printed 254; in the Jay Hiren Gandhi revision application, PDF p. 58 is printed 42, which is the index's "Exhibit A, Pg. 42-44". The number is read from bare numbers on a page's first or last lines, kept only when it runs in sequence with neighbouring pages. Blank backs get none. The result is cached per matter in `_system/study/<matter>/printed.json`; new papers are added on first view. Receipts, footnotes, pins, search, dates and MCP labels show "p. 254 (PDF 350)". The reader shows "Page 3 of 38, printed 254", and `?pg=254` opens a page by its printed number. To recompute, delete the matter's printed.json.
- **Chronology order.** Your chronology has As arranged (with the move buttons), Oldest first and Newest first. Dates in the papers has Oldest first and Newest first. Chronology dates are now shown as DD-MM-YYYY.
- **Drafting skill on the MCP.** Her Maharashtra courts drafting pack is copied verbatim into `companion/drafting/` and traced into the MCP function (`next.config.ts`). The tools are `drafting_skill` (the guide and a file index) and `drafting_file` (one file; only listed paths are served). There is also a `draft` prompt. Rule 9 in the guide and in SKILL.md: before drafting, ask whether to use the skill and whether she has a reference document, and wait for both answers.
- **Agile re-split.** The 441-page volume is now 19 papers. The old whole-volume paper "Appeal and Exhibits - Vikram Singh" is still there next to them, waiting for an OK before it is deleted.
- **Not verified yet:**
  - "Prashant Hingorani 2.pdf" was still filing at the time of writing (4 papers so far).
  - "WP - Order - 16-09-2026.pdf" is queued behind it.
  - The new matter "jay-hiren-gandhi-vs-the-deputy-registrar" has no papers yet.
  - Once they are filed, make their explainers from the Explainer tab.

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

Added 04-10-2026: `TYPESAFE_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK`, `JEV_STAGES` (off|eval|on, now on), `JEV_RERANK` (now eval), optional `LLM_BACKUPS`, `BEDROCK_REGION`.

`LLM_MODEL XAI_API_KEY DEEPSEEK_API_KEY OPENAI_API_KEY SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY COMPANION_LINK_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_USERS RESEND_API_KEY AGENTMAIL_API_KEY NOTIFY_EMAILS NOTIFY_MUTED`

These keys were pasted in chat earlier, so rotate them: OpenAI, xAI, DeepSeek, Supabase service role, Telegram, Resend, LlamaParse.

`LLAMA_CLOUD_API_KEY` is worker-only (not in Vercel): LlamaParse reads a page when Google Vision is down or fails it; `document_pages.text_source` says `llamaparse` for those pages. xAI key replaced 30-09-2026 (local and Vercel). xAI has no embedding model, so search by meaning still needs OpenAI credit.

## Tests

The `<link>` in the commands below is Omkar's sign-in link from the keys file.

```bash
cd companion && npm run typecheck && npm test && npm run build
node scripts/e2e.mjs https://case-companion.edenbuilds.me <link> <small.pdf>
node scripts/responsive-check.mjs https://case-companion.edenbuilds.me <link> <shots-dir>
node scripts/study-e2e.mjs https://case-companion.edenbuilds.me <link>   # search, pins, dates, explainer, printed pages, compare, brief
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

- **Supabase free plan, 50 MB per object:** no longer a limit for her. Any file over 40 MB is stored as `<path>.part000…` and joined on read or in the browser (see 04-10-2026 (final)). Pro would only simplify storage.
- **Telegram:** files over 20 MB can't be fetched by the bot, so they need the web upload.
- **Test matter:** `zz-upload-test` collects e2e uploads. Delete it when testing stops.
- **OpenAI credit (about $5):** embeddings only. Until then search by meaning is off and whole-matter Ask leans on exact words. The idle worker fills the missing vectors on its own once credit is there.
- **Checked 30-09-2026:** typecheck, npm test (21), build, e2e (12/12), responsive (24 pages x 4 devices), study-e2e, mcp-smoke, agent-test (5/5), and an upload through the worker. Not re-checked: a real Telegram question.
- **Key rotation:** see Env vars above.

## Paste-ready prompt for the next agent

"Read companion/HANDOFF.md, the sections ‘05-10-2026’ and ‘04-10-2026 (night, later)’., then DESIGN.md. Run `node scripts/polish-check.mjs https://case-companion.edenbuilds.me \"$LINK\"` (LINK is read from line 13 of ~/Downloads/case-secrets-env/case-companion-keys.md into a variable and never printed). Then re-run `scripts/liquidtext-check.mjs`, and test press and hold, the share sheet and haptics on a real iPhone and an Android phone. One task, then update the handoff."


> Work in /Users/omkar/vikram-shah-archive/companion (Case Companion, live at case-companion.edenbuilds.me). Read HANDOFF.md, then DESIGN.md for any UI work. Rules:
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

## 04-10-2026 (later): one Vercel project, Gemini embeddings

**Vercel projects** (team omkar1sonawane-2991s-projects):
- `case-companion` (prj_gBhGtra44uibDjdJrRtK5CeyX8FZ, formerly named vikram-shah-archive): the app. It serves case-companion.edenbuilds.me and deploys from `companion/` by CLI. `companion/.vercel/project.json` points here.
- `case-archive` (prj_j2AeSbKiohM5fWsIARsPXtyOF6Ab): the public paper archive at case-archive.edenbuilds.me. It auto-deploys from GitHub (edenbuilds/vikram-shah-archive, root `.`; `.vercelignore` drops companion/).
- `case-companion-old` (prj_NWI1P704hFbFhhLEkeNih939UeYP): the previous app project, which no longer has a domain. Delete it only after Omkar says so. Rollback: move the domain back to it.
- Env vars: `vercel env pull` writes sensitive values as the literal `[SENSITIVE]`. Copying env that way served a 500 ("Invalid supabaseUrl") for about a minute. Set values from `.env.local` through the API instead.

**Embeddings** now run on the Vercel AI Gateway as `google/gemini-embedding-001` at 1536 dimensions, because the OpenAI account is out of credit.
- The app authenticates with the Vercel OIDC token (the `x-vercel-oidc-token` header) or `AI_GATEWAY_API_KEY`.
- The worker refreshes the token from `vercel env pull` into `~/.cache/case-companion/gateway.env`.
- The free tier allows 5 embedding requests a minute per team, so `corpus.embed` waits out a 429.
- Every stored vector was rewritten with `worker/reembed_all.py`. Vectors from OpenAI and Gemini cannot be compared.

## 04-10-2026: corrections, bookmarks, OCR uploads, shared memory, Jev, provider chain

Commits 7d33112, 95e2006, e7e38a8 on main, deployed to production.

**What anyone with access to a matter can now do**
- **Correct a page's read text** (two-way). Three ways in:
  - on the paper page, use "Correct this page";
  - upload the edited Markdown download back: only pages that changed are saved, and the "## Page N" headings must stay;
  - through MCP `correct_page`, which shows a preview with changed lines and the scan link, and saves only with confirm:true.
  
  A correction updates `document_pages.text` (text_source becomes `corrected`), that page's chunks and the transcript. The text first read and every later version are kept in `_system/corrections/<doc>.json`, and "Put back the original" (or `revert:true`) restores both the text and its source. The scan and the PDF are never changed. Code: `lib/corrections.ts`.
- **Her PDF bookmarks** (PDFGear, Acrobat, Preview) are read by the worker with pypdf. They become the paper's contents, nested, under the heading "Your bookmarks". This applies to papers filed whole; a volume split by its own index keeps the index. Older papers are not backfilled.
- **Upload her own OCR text** with the scan: name it `Appeal.pdf` + `Appeal.txt`, `Appeal.ocr.txt` or `Appeal.md`. Pages are split on form feeds or on "Page N" markers. When the page count doesn't match, the worker reads the scan as before.
- **Memory across devices**. It lives in one file per person (`_system/memory/`). It is read and written by:
  - Settings, Memory;
  - Telegram: /remember, /memory, /forget N;
  - MCP: get_memory, plus remember/forget (preview first);
  - Ask, which gets it as instructions, never as facts.

**Jev (TypeSafe, pinned to jev-1.13.0)**
- `JEV_STAGES=on`: on a paper page, when Jev's forward and reversed option orders agree and the result is not "uncertain", it shows "Suggested stage: X (model probability N%)" with a "Move here" button. Moves are recorded so the correction rate can be measured.
- `JEV_RERANK=eval`: Jev computes the passage order and logs it (`jev_rerank`, plus `qa_messages.retrieved.jev`), but answers are unchanged. Context reduction is off.
- Rollback: set the env var to `off` in Vercel and redeploy. With no key, or on a timeout or an invalid answer, the existing path runs.

**Eval** (`scripts/jev-eval.ts`; public matter shah-v-trindade only; Jev cost USD 0.0034 for 80,540 input tokens):

| Check | Result |
|---|---|
| Stages, n=25 | Matched the filing 21; uncertain 1; would-be corrections 3. Accuracy when suggested: 21/24. p50 319ms, p95 705ms. |
| Rerank recall@8 | **Not measured.** Only 1 past answered question has receipts, and its gold page was not among the candidates (n=0). Rerank stays in eval. |
| Ask, rerank off vs on | n=4 questions, but n=1 per mode effectively: off answered 1, on answered 0. Too small to conclude. |
| Adversarial passage | The injected instruction passage ranked 8 of 11. |
| Denied matter | 0 candidates outside the allowed papers. |
| API failure (bad key) | Falls back ("http 401") with the order unchanged. |

**Providers** (`lib/ai.ts`): primary model, then `LLM_BACKUPS` (default `deepseek-v4-pro,openai.gpt-6-luna,openai/gpt-5.4-nano`). A provider that is out of credit is skipped for 10 minutes.
- xAI: out of credit.
- DeepSeek: works.
- Bedrock (`AWS_BEARER_TOKEN_BEDROCK`): returns 403 "account is being verified". **Blocked on AWS.**
- Vercel AI Gateway: free tier, small models only, via the OIDC token. Not yet seen serving a production request.

**Verified live 04-10-2026**
- e2e: 12/12.
- New features: 13/13 at desktop and 390px (OCR pair, bookmarks, correct and revert, memory).
- MCP: 9/9 (correct_page preview, confirm and revert; verify_quote on corrected text; memory tools).
- Stage-on mode renders, and a suggestion shows.
- Unit tests 33/33; worker tests pass.

**Blocked / next**
1. AWS Agent Toolkit: needs Omkar's profile name, AWS experience level and region. Then install the AWS CLI, run `aws login` in the browser, and run the `aws configure agent-toolkit` wizard.
2. Bedrock inference: waiting on AWS account verification.
3. Rerank: collect live eval logs, then measure recall@8 on more receipted questions before `JEV_RERANK=on`.
4. Optional: backfill bookmarks for papers uploaded before 04-10.

**Continuation prompt**
> Case Companion (~/vikram-shah-archive/companion). Read HANDOFF.md, section 04-10-2026. Measure Jev rerank: pull `qa_messages.retrieved.jev` logs plus receipts from answered questions, compute recall@8 for the logged order vs the original, and report n, p50/p95 and cost. Set JEV_RERANK=on only if recall is no worse. Do not change OCR or volume splitting. Commit as omkar1sonawane@gmail.com, deploy with `npx -y vercel@latest deploy --prod --yes`, and verify live at desktop and 390px.

## 02-10-2026: why it "stopped working", fixed and verified live

- **macOS 27 removed Rosetta.** The Intel poppler (`pdftotext`, `pdftoppm`, `pdfinfo`) and node in `/usr/local/bin` no longer run ("Bad CPU type"), so every new upload would fail. Native tools are installed in `/opt/homebrew` (`brew install poppler node gh`); the worker puts `/opt/homebrew/bin` first, and the LaunchAgent PATH does too. If a PDF tool can't run, jobs now wait in the queue with one log line instead of failing.
- **The xAI account is out of credit** (Ask, briefs, drafting, reading all failed). `lib/ai.ts` now sends the same request to the other provider when one is out of credit, 5xx, 429 or unreachable: xAI falls back to `deepseek-v4-pro`, DeepSeek to grok-4.3. DeepSeek balance on 02-10-2026: USD 9.56. Agent test 5/5 on the fallback; live e2e 12/12; brief refresh done.
- The worker log no longer writes the OpenAI 429 every 5 minutes (backs off 6 hours). The old 70k-line log is at `~/Library/Logs/case-companion-worker.log.old-20261002`.
- Shell note: run scripts with `PATH=/opt/homebrew/bin:/usr/bin:/bin:$PATH`; the old `vercel` pnpm shim and `gh` in `/usr/local/bin` are Intel and dead. Deploy with `npx -y vercel@latest deploy --prod --yes`.
- **Still structural:** reading uploads needs Omkar's Mac awake and online. Uploads made while it sleeps wait in the queue (nothing is lost) and are filed when it wakes.
- Needs Omkar: top up xAI (console.x.ai) or leave DeepSeek as the main model; OpenAI credit for embeddings.

## 04-10-2026 (latest): Kimi K3 on Bedrock, MarkItDown, bookmarks

- **Main model:** Kimi K3 through AWS Bedrock (Converse API, `lib/ai.ts`), on the Flex tier: `LLM_MODEL=bedrock:global.moonshotai.kimi-k3@flex`. Flex is half price ($1.50 / $7.50 per M tokens) and measured about 15% slower (8.6s vs 7.4s).
- **Fallback order** (`BACKUPS`): Kimi standard, then DeepSeek V4 Pro, then Opus 4.6 (Bedrock), then gpt-5.4-nano. A model that returns 403 is skipped for 10 minutes. `lib/converse.test.ts` covers this.
- **AWS:** account 629496257875 (billed by AISPL), $49.66 in credits as of 04-10-2026. The bearer key is in `AWS_BEARER_TOKEN_BEDROCK`.
- **Blocked on AWS:**
  - Opus 4.6 and Sonnet 4.x return INVALID_PAYMENT_INSTRUMENT. Fix the card in Billing > Payment preferences.
  - Textract returns SubscriptionRequiredException.
  - The newest Claude and GPT models are not offered to this account.
- **EC2:** i-01b777d29e588ede1 (eu-north-1) is stopped. Terminate it in the console; the owner does that.
- **MarkItDown** (worker `as_pdf`) converts .pptx .xlsx .xls .epub .msg .ipynb .json .xml to text, then to PDF. The Uploader accepts these types.
- **Bookmarks:**
  - The PDF's own outline shows as "Your bookmarks" (worker `bookmarks()`).
  - Her own bookmarks are `annotations` rows tagged `bookmark`, with body = name. They are listed under "Bookmarked by you" on the paper page and in MCP `get_paper`.
  - She adds them from the reader ("Bookmark page N as...") or through MCP `add_note` with `bookmark: true`, which previews first and saves only on confirm.
- **Sticky notes:** these are page notes (`annotations`), on the web and through MCP `add_note` / `get_notes`.

Paste-ready next prompt: "Read companion/HANDOFF.md latest section. Once the AWS card is fixed, re-test Opus 4.6 and Textract with a Converse call and `aws textract detect-document-text`. If Textract works, compare its cost and accuracy with Google Vision on 5 scanned pages before switching."
