# Legal Paper Archive — Product PRD

**Status:** v1 live (single-tenant reference)  
**Reference deployment:** https://case-archive.edenbuilds.me  
**Alt:** https://vikram-shah-archive.vercel.app  
**Repo:** https://github.com/edenbuilds/vikram-shah-archive  
**Date:** 11 September 2026  

---

## 1. One-liner

Turn a pile of court / arbitration PDFs into a **public, searchable reading room**: typed transcripts, original scans, Act-stage filing tree, and downloadable Markdown / Word / ZIP — with a hard disclaimer that these are a **party’s papers**, not an award and not advice.

## 2. What exists today (Shah v. Trindade)

| Capability | Status |
| --- | --- |
| 141 PDFs / 2,084 pages as separate documents | Done |
| Verbatim OCR + Markdown + Word | Done |
| Act-ordered filing stages (s.11 → SoC/SoD → s.16 → s.17 → …) | Done |
| Sticky “you are here” crumbs (mobile-truncated) | Done |
| Filing tree drawer (SVG icons, no emoji; Expand/Collapse/filter) | Done |
| ⌘K / Ctrl+K command palette (stages, papers, sections, nav) | Done |
| Mindmap of Act stages | Done |
| Light Vercel SPA + heavy scans/PDFs on Supabase | Done |
| Master MD+DOCX ZIP (~8 MB); PDFs on object storage | Done |

**Non-goals of v1:** login, comments, AI chat over the corpus, editable pleadings, multi-tenant admin UI.

---

## 3. Problem → product

### Problem
Counsel, clerks, journalists, and opposing parties get **folder dumps**. PDFs are unsearchable on phones; chronology is opaque; “the brief” lives in someone’s head.

### Job to be done
> When I open a cause on my phone, I need to **find the right paper in under 30 seconds**, read the typed text, flip the scan, and take files offline — without wondering if the site is inventing facts.

### ICP (initial)
1. **Party / instructing solicitor** who wants a shareable public reading copy.  
2. **Tribunal clerk / junior** who needs Act-stage navigation.  
3. **Press / researcher** who needs disclaimer-safe access.

### Wedge
Indian arbitration & commercial papers first (A&C Act mental model). Same shell works for High Court / civil trees later.

---

## 4. Product principles

1. **Papers, not opinions.** Every surface repeats: restates a party’s papers; not an award; not advice; not a finding.  
2. **One PDF = one document.** Never merge annexures into a blob.  
3. **Verbatim.** `[ILLEGIBLE]` over invention; keep conflicting amounts as printed.  
4. **Phone-first reading.** Sticky location, drawer tree, ⌘K — never a second sticky bar that eats the brief.  
5. **Stable URLs.** `/docs/{id}/transcript`, `/pages/{id}/page-NNN.jpg` survive storage moves.  
6. **Cheap to host.** Reader is static; binaries live in object storage.

---

## 5. UX contract (shipped)

```
Header: brand · primary nav · Search (⌘K) · Take files · Menu
Locator: Filing tree · crumbs (Archive / Stage / Paper / Leaf)
Drawer: Act stages → papers → Transcript | Sections | Scans | Summary
Palette: Go to · Stages · Papers · Sections (filter as you type)
```

- **Desktop:** tree is a side sheet; palette centered.  
- **Phone:** tree full-height sheet with grab; crumbs collapse to `Archive / … / last two`.  
- **Icons:** stroke SVG only (folder / file / chevron). No emoji.

---

## 6. How we productise this

### Phase A — Reference product (now)
Single cause, hand-assembled registry (`archive.json`), scripts for OCR + upload.  
**Sell / use as:** bespoke “public brief” for one matter. Delivery = domain + ZIP + disclaimer.

### Phase B — Repeatable studio (next 2–4 weeks)
Make the second cause a **config + drop folder**, not a rewrite.

| Workstream | Deliverable |
| --- | --- |
| Case config | `case.yaml` → title, parties, forum, disclaimer, bundle order |
| Ingest CLI | `ingest folder/` → inventory PDFs, hash, page count, draft bundles |
| OCR pipeline | Firecrawl / pdftotext / Vision with density picker (already in `assemble.py`) |
| Theme pack | CSS tokens (seal / paper / fonts) per firm |
| Deploy recipe | Vercel project + Supabase bucket + rewrite template |
| QA harness | Checklist script: 200s on downloads, transcript count, page JPEG parity |

**Output:** “Archive Studio” runbook — one engineer / clerk can ship a new matter in a day.

### Phase C — Multi-tenant SaaS (3–6 months)
Only after 3–5 paid bespoke archives.

| Layer | Choice |
| --- | --- |
| Tenant model | `org` → `matters[]`; public or link-gated |
| Auth | Optional Magic-link for draft; public read remains static export |
| Storage | Per-tenant prefix in one bucket or one bucket per org |
| Search | Client palette (v1) → Typesense/Meilisearch over transcripts (v2) |
| Admin | Upload PDFs, set stage map, approve OCR, publish static snapshot |
| Billing | Per-matter flat fee + storage overage (not seat-based at first) |

**Critical product rule:** publish is a **static snapshot** (JSON + MD + rewrites). Admin can be dynamic; the reader stays boring and fast.

### Phase D — Platform features (later)
- Full-text search across all transcripts (server index).  
- Cite / deep-link to paragraph or scan page.  
- Compare two papers (side-by-side).  
- Redaction workflow before publish.  
- Private matters (signed URLs) vs public.  
- Firm white-label domains.

**Explicitly later / careful:** generative “case chat.” If added, fence it as editorial assist with source pins — never as findings.

---

## 7. Packaging & pricing (suggested)

| SKU | What’s included | Price shape |
| --- | --- | --- |
| **Brief Archive** | One matter, public SPA, MD+DOCX pack, scans hosted 12 mo | Fixed project fee |
| **Brief Archive + Private** | Link gate / password before publish | + % |
| **Retain / Update** | Add new filings, re-OCR, redeploy | Monthly retainer |
| **Studio license** | Scripts + templates for in-house clerks | Annual |

Do **not** sell “AI lawyer.” Sell **clerk infrastructure**.

---

## 8. Architecture to keep (product spine)

```
ingest → OCR/assemble → archive.json + transcripts + downloads
                              ↓
                    static reader (Vercel)
                              ↓
              heavy pages/PDFs/ZIPs (object storage)
```

Reader stack today: vanilla HTML/JS/CSS.  
**Product rule:** do not force React/shadcn onto the reader until multi-tenant admin needs a real app. The reader’s job is durability and phone speed.

Admin / Studio (Phase C) can be Next.js + shadcn; it **publishes** into this static shell.

---

## 9. Success metrics

| Metric | Target |
| --- | --- |
| Time to first paper from landing (mobile) | < 30 s |
| ⌘K → open paper | < 3 keystrokes after query |
| Lighthouse mobile performance (reader shell) | ≥ 90 |
| OCR pages with `[ILLEGIBLE]` only when necessary | clerk audit sample weekly |
| Deploy size on Vercel | stays under Hobby limits (binaries off-box) |
| Second matter time-to-publish (Phase B) | ≤ 1 working day |

---

## 10. Risks

1. **Legal framing** — must never look like tribunal output. Disclaimer + voice.  
2. **OCR liability** — verbatim + ILLEGIBLE; human spot-check money figures.  
3. **Secret hygiene** — rotate any keys pasted in chat; never in browser.  
4. **Scope creep** — chatbots and gantt demos are not the wedge.  
5. **Domain confusion** — do not overwrite older `legaldoc.edenbuilds.me` without explicit cutover.

---

## 11. Immediate backlog (post-v1)

1. Rotate Supabase service role + Google OAuth client secret.  
2. Spot-check 5 bank amounts vs scans.  
3. Extract `case.yaml` + ingest CLI (Phase B start).  
4. Optional: Meilisearch over transcripts for ⌘K (still static-hosted reader).  
5. White-label CSS tokens for a second matter.

---

## 12. Owner commands (this repo)

```bash
cd /Users/omkar/vikram-shah-archive
python3 scripts/assemble.py
python3 scripts/upload_supabase.py zips   # or pages|pdfs|all
vercel deploy --prod --yes
```

Production aliases: `case-archive.edenbuilds.me`, `vikram-shah-archive.vercel.app`.

---

*Editorial document. Not a finding. Not legal advice.*
