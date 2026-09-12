# Claude handoff — Shah v. Trindade archive

**Continue from here.** Short context only. Deep forensic / product detail lives in `docs/HANDOFF-PRD.md` and `docs/PRODUCT-PRD.md`.

## Live

| | |
| --- | --- |
| Prod | https://case-archive.edenbuilds.me |
| Alt | https://vikram-shah-archive.vercel.app |
| Repo | https://github.com/edenbuilds/vikram-shah-archive |
| Branch | `main` @ `9bebca7` |
| Vercel project | `vikram-shah-archive` |
| Supabase | `mnsmfobozohejvnmnalw` · public bucket `archive` |

**Do not** overwrite `legaldoc.edenbuilds.me` / other causes without an explicit ask.

## What this is

Static vanilla SPA (not React/Next/shadcn): `public/index.html` + `app.js` + `styles.css` + `archive.json`.

- **141 PDFs / 2084 pages**, all transcribed
- Reader on Vercel; scans / original PDFs / per-doc ZIPs on Supabase via `vercel.json` rewrites
- Master ZIP on Vercel is **MD+DOCX only** (~8 MB)

## UX shipped (don’t regress)

- Sticky **locator**: Filing tree + crumbs (mobile-truncated)
- Tree = **drawer/sheet**, not a popover that covers the brief
- **SVG icons only** (no emoji) via `ICONS` in `app.js`
- **⌘K / Ctrl+K** command palette (`#palette`)
- Mindmap Cause card uses **`mm-cause`**, never class `seal` (collides with brand logo circle)

## Key files

```
public/app.js          SPA routes, tree, ⌘K, mindmap
public/styles.css      tokens + locator/tree/palette/mindmap
public/archive.json    registry (also data/archive.json source of truth often synced)
public/index.html      shell: header, locator, tree sheet, palette
vercel.json            rewrites → Supabase for /pages, pdfs, *-transcripts.zip
scripts/assemble.py    OCR merge → transcripts / Word / ZIPs
scripts/upload_supabase.py
docs/HANDOFF-PRD.md    forensic QA + acceptance
docs/PRODUCT-PRD.md    how to productise (Studio → SaaS)
```

Chronology doc id is **`list-dates`** (not `list-of-dates`). Bundle id for chronology stage may still be `list-of-dates` — check registry before changing links.

## Owner commands

```bash
cd /Users/omkar/vikram-shah-archive
# secrets: .env.supabase / .env.google (gitignored) — rotate if pasted in chat
python3 scripts/assemble.py
python3 scripts/upload_supabase.py zips   # or pages|pdfs|all
vercel deploy --prod --yes
```

## Open / next (pick with user)

1. **Rotate** Supabase service role + Google OAuth client secret (were pasted in chat historically).
2. Spot-check ~5 bank amounts vs scans.
3. Phase B productisation: `case.yaml` + ingest CLI so the next matter isn’t a rewrite (`docs/PRODUCT-PRD.md`).
4. Optional: full-text index behind ⌘K (Meilisearch) — reader can stay static.
5. Untracked: `docs/STUDY-COMPANION-PROMPT.md` — ask before merging / deploying.

## Rules of the road

- Verbatim OCR; `[ILLEGIBLE]` never invent; disclaimer on every surface.
- One PDF = one document; Act-stage bundles (s.11 → SoC/SoD → s.16 → s.17 → …).
- Phone-first; don’t add a second sticky bar that eats content.
- No React FileTree/Gantt paste into this SPA unless building a **separate** admin/Studio app.
- Voice: clerk of the papers — not “AI legal assistant.”

## Smoke after any UI change

```bash
BASE=https://case-archive.edenbuilds.me
curl -sI "$BASE/" | head -1
curl -s "$BASE/archive.json" | python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for x in d['docs'] if x.get('transcribed')),len(d['docs']))"
# Manual: /map Cause card full width; ⌘K opens; Filing tree drawer; mobile crumbs truncate
```

*Editorial. Not a finding.*
