# Shah v. Trindade — paper archive

Public reading copy of papers in *Mr. Vikram Shah v. Mrs. Riva Trindade & Ors.*

This archive restates a party's papers. It is not an award, not legal advice, and not a determination of fact.

**Live:** https://vikram-shah-archive.vercel.app  
**Handoff PRD:** [docs/HANDOFF-PRD.md](docs/HANDOFF-PRD.md)

## Run locally

```bash
chmod +x startup.sh
./startup.sh
```

Serves `public/` on `0.0.0.0:8080`.

## Architecture

| Layer | Holds |
| --- | --- |
| Vercel (`public/`) | SPA, `archive.json`, Markdown/Word transcripts, master `shah-v-trindade-archive.zip` |
| Supabase bucket `archive` | Page JPEGs, original PDFs, per-document `*-transcripts.zip` |

Stable browser paths (`/pages/…`, `/downloads/*.pdf`, `/downloads/*-transcripts.zip`) rewrite to Supabase via `vercel.json`.

## Object storage upload

```bash
set -a; source .env.supabase; set +a   # gitignored — never commit
python3 scripts/upload_supabase.py zips   # or: pages | pdfs | all
```

## Rebuild transcripts

```bash
# optional: thin Firecrawl reparses
python3 scripts/reparse_weak.py

# optional: Google Vision page OCR for thin/scan-like leaves (ADC + certifi)
# writes work/google_ocr/{docId}/page-NNN.txt
python3 scripts/google_vision_ocr.py

python3 scripts/assemble.py
```

Google Vision uses Application Default Credentials (`gcloud auth application-default login`). A `GOCSPX-…` OAuth client secret alone is not enough for Vision; keep secrets in gitignored `.env.google` / `.env.supabase`.

## Deploy

```bash
vercel deploy --prod --yes
```

Do not overwrite `legaldoc.edenbuilds.me` unless explicitly asked — that site is a different cause.
