# Shah v. Trindade — Public Legal Paper Archive
## Handoff PRD & Forensic QA Report

**Status:** Production  
**URL:** https://vikram-shah-archive.vercel.app  
**Repo:** https://github.com/edenbuilds/vikram-shah-archive  
**Object storage:** Supabase project `mnsmfobozohejvnmnalw`, public bucket `archive`  
**Date:** 11 September 2026  

---

### 1. Product one-liner

A stranger on a phone can open this site, read every paper as typed text, flip the original scan, download Markdown / Word / ZIP / original PDFs, and understand they are looking at a **party’s papers** — not an award and not legal advice.

### 2. Case frame (Indian law)

| Field | As stated on the papers |
| --- | --- |
| Short cause | Shah v. Trindade |
| Claimant | Mr. Vikram Shah |
| Respondents 1–3 | Mrs. Riva Trindade & Ors. |
| Respondent No. 4 | Mr. Murlidhar Sadarangani |
| Appointment | AAR No. 13 of 2024, High Court of Bombay at Goa (Arbitration & Conciliation Act, 1996, s.11) |
| Tribunal | Hon’ble Sole Arbitrator, Mr. Nitin N. Sardesai, Senior Advocate, Panaji |
| Related civil | SCS 52/2013/A, Communidade of Bambolim v Pascoal Trindade & Ors. |

Navigation stages follow how an Indian arbitration brief is usually read:

0. Chronology → 1. s.11 appointment → 2. SoC / SoD → 3. s.16 → 4. s.17 → 5. Later applications → 6. Minutes → 7. Title & instruments → 8. Financial → 9. Correspondence → 10. Without-prejudice lists → 11. Civil suit → 12. Prior title litigation → 13. Extracted R4 replies.

Each PDF is its own document. Annexures are not dumped into one blob.

### 3. Non-negotiables (acceptance)

- [x] Verbatim transcription; no silent “correction” of amounts / names / dates  
- [x] Disclaimer on home, summary, footer, Word header  
- [x] Multi-document model (141 PDFs → 141 documents)  
- [x] Real static downloads under `/downloads/` (200 with bodies)  
- [x] Full transcript + sections + original pages + files (not summary-only)  
- [x] Auth off, database off for the reader  
- [x] Mobile menu starts closed; overlay drawer; Escape / backdrop / route close  
- [x] Vercel stays light; heavy scans/PDFs/ZIPs on Supabase  

### 4. Architecture

```
Vercel (static SPA)
  ├── index.html / app.js / styles.css
  ├── archive.json (registry)
  ├── transcripts/** (Markdown)
  └── downloads/*.{md,docx,shah-v-trindade-archive.zip}

Supabase Storage bucket `archive` (public)
  ├── pages/{docId}/page-NNN.jpg
  ├── downloads/*.pdf
  └── downloads/*-transcripts.zip
```

Rewrites in `vercel.json` map `/pages/*`, `/downloads/*.pdf`, and `/downloads/*-transcripts.zip` to Supabase so the browser keeps stable paths.

### 5. Forensic: where we went wrong, how we corrected it

| Failure | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| Summary-only / stub risk | Earlier `legaldoc.edenbuilds.me` pattern confused with this case | Different cause (Sadarangani affidavit) vs full Shah tree | New repo + new Vercel project; never overwrite old domain without explicit ask |
| Vercel size / Hobby limits | Deploy too heavy with 2k+ JPEGs + PDFs | Putting binary corpus in the web project | `.vercelignore` excludes pages/PDFs/per-doc ZIPs; Supabase holds them |
| Master ZIP too large | ~159 MB zip blocked light deploys | Master pack included original PDFs | Master zip is Markdown + Word only (~8 MB); PDFs stay in per-doc ZIPs on Supabase |
| SSL upload / Vision failure | `CERTIFICATE_VERIFY_FAILED` on macOS Python | System OpenSSL without certifi CA bundle | `httpx`/`urllib` + `certifi.where()` in upload + Vision scripts |
| Thin Firecrawl on long scans | e.g. 57-page production application ~8 KB | Continuous OCR truncated; preferred over denser text layer | `assemble.py` prefers denser `pdftotext` per page; merges Firecrawl + pdftotext when useful |
| Missing page markers | 100+ continuous OCR blobs | Firecrawl returns unbroken Markdown | Page-keyed pdftotext / Vision path; clerk note when continuous OCR remains |
| Google “OCR key” misunderstanding | `GOCSPX-…` alone cannot call Vision | That string is an OAuth **client secret**, not a Vision API key | Stored in gitignored `.env.google`; Vision uses ADC + quota project `shb-documents-portal-20260729` (Vision API enabled) |
| Vision 403 on first try | `quota project` / consumer mismatch | ADC without `x-goog-user-project` | `gcloud auth application-default set-quota-project` + user-project header |
| Wrong IA for Indian practice | Flat folder dump | Source folders ≠ brief order | Bundle stages renamed/ordered under A&C Act ss.11/16/17 + civil / Comunidade |
| Download 404 risk | Buttons pointed at excluded binaries | Per-doc ZIPs/PDFs not on Vercel | Direct Supabase URLs via `assetUrl()` + Vercel rewrites |
| Secret leakage risk | Service role / OAuth secret pasted in chat | Needed for one-shot upload / OCR | Keys only in gitignored env files; **rotate after handoff** |
| Duplicate / confusing names | Shah/Vikram, Trindade/Trindade spelling variants | Source filenames inconsistent | Registry keeps source spelling; UI disclaimer says “as stated” |
| Chronology id mismatch | Checklist used `list-of-dates` | Registry id is `list-dates` | Verification uses `list-dates` |

### 6. OCR / transcription QA

**Corpus:** 141 PDFs, 2,084 pages.

**Pipeline:**

1. Firecrawl parse → `.firecrawl/{id}.md`  
2. Optional Google Vision `DOCUMENT_TEXT_DETECTION` on thin / scan-like leaves → `work/google_ocr/{id}/page-NNN.txt` (314 pages across 36 documents in the final pass)  
3. `scripts/assemble.py` picks denser page-keyed source (Vision → pdftotext → Firecrawl merge) → `public/transcripts/**`, Word, ZIPs  

**Final source mix (post-Vision assemble):**

| Source | Documents |
| --- | --- |
| Firecrawl | 78 |
| Google Vision | 36 |
| pdftotext | 27 |

**Audit:**

- Missing transcript files: 0  
- `transcribed: true` for all 141 registry docs  
- Page JPEG count mismatches vs registry: 0  
- Stamp/signature tags present on tagged pleadings: yes (where printed)  
- Known thin Firecrawl outlier (production application) rebuilt from denser page extract  
- Bank / company filings retain table pipes and `Rs` / amount strings as printed  
- Master ZIP size after PDF exclusion: ~8.2 MB  

**Ongoing clerk rule:** If a page cannot be read, mark `[ILLEGIBLE]` — never invent. Amounts that appear two ways stay both ways.

### 7. Downloads contract

| Asset | Location | Path |
| --- | --- | --- |
| Master MD+DOCX ZIP | Vercel | `/downloads/shah-v-trindade-archive.zip` |
| Case summary | Vercel | `/downloads/CASE-SUMMARY.md` |
| Per-doc FULL-TRANSCRIPT.md/.docx | Vercel | `/downloads/{id}-FULL-TRANSCRIPT.*` |
| Per-doc ZIP (includes original PDF) | Supabase | `/downloads/{id}-transcripts.zip` |
| Original PDF | Supabase | `/downloads/{file}.pdf` |
| Page scans | Supabase | `/pages/{id}/page-NNN.jpg` |

QA: every Download href must 200 with a non-empty body. Master ZIP must open and contain transcripts.

### 8. UI / UX

- Paper brief tokens (seal `#8b2e2e`, paper `#f4eee4`, Libre Baskerville + Source Sans 3)  
- Landing: two CTAs only — Read transcript / Download Markdown & Word  
- Filing tree with Act-aware stages; filter box; map table  
- Mobile: menu closed on load; drawer; hamburger above scrim  
- 404 copy: “This leaf is not in the papers.”  
- Voice: clerk of the papers; no “AI-powered legal assistant.”  

### 9. CI/CD

- GitHub repo `edenbuilds/vikram-shah-archive` connected to Vercel project `vikram-shah-archive`  
- Production deploy: `vercel deploy --prod --yes` (static `public/`)  
- Optional GitHub Action: `.github/workflows/deploy.yml` (requires `VERCEL_TOKEN`)  
- Heavy assets: `python3 scripts/upload_supabase.py [zips|pdfs|pages|all]` with service role  
- Rebuild transcripts: `python3 scripts/google_vision_ocr.py` (optional) then `python3 scripts/assemble.py`  

### 10. Security

- Reader: no auth, no DB, no service role in browser  
- Service role / OAuth secrets used only for local scripts  
- **Rotate the Supabase service role key and Google OAuth client secret** that were pasted into chat after this handoff  
- Bucket `archive` is public-read for the paper corpus (intentional)  

### 11. Verification checklist (run before calling done)

```bash
BASE=https://vikram-shah-archive.vercel.app
curl -sI "$BASE/" | head -1
curl -sI "$BASE/downloads/shah-v-trindade-archive.zip" | head -5
curl -sI "$BASE/downloads/CASE-SUMMARY.md" | head -5
curl -s "$BASE/archive.json" | python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for x in d['docs'] if x.get('transcribed')),len(d['docs']))"
curl -sI "$BASE/pages/list-dates/page-001.jpg" | head -5
curl -sI "$BASE/downloads/list-dates.pdf" | head -5
curl -s "$BASE/transcripts/list-dates/FULL-TRANSCRIPT.md" | head -20
```

Mobile: 390px — menu closed; open; close via X / scrim / link / Escape; no horizontal overflow.

### 12. Open risks / follow-ups

1. Rotate Supabase service role key and Google OAuth client secret.  
2. Spot-check 5 bank amounts against scans on Annexure A / C statements.  
3. Dense continuous-OCR docs that already have long Firecrawl bodies can still gain page markers via a later Vision pass (optional cost).  
4. Custom domain: attach only if requested — do not steal `legaldoc.edenbuilds.me` without an explicit cutover.  
5. Word packs: confirm PAGE fields and seal-coloured headers on a sample DOCX after final assemble.

### 13. Owner commands

```bash
cd /Users/omkar/vikram-shah-archive
set -a; source .env.supabase; set +a   # local only
python3 scripts/google_vision_ocr.py   # optional thin-scan pass
python3 scripts/assemble.py
python3 scripts/upload_supabase.py zips
vercel deploy --prod --yes
```

---

*This document is editorial. It is not a finding.*
