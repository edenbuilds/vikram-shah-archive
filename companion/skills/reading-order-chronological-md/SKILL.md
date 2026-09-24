---
name: reading-order-chronological-md
description: Generate a chronological Reading Order for a legal case as a plain Markdown (.md) file — every document in the matter, ordered strictly by its own date, with the same What it is / What it says / Implication / Importance fields as the standard reading-order skill. Use whenever Arya wants a reading order "organised chronologically" or "by date" and wants it as a .md file rather than a Word table or PDF. Distinct from the standard reading-order skill (understanding-order, .docx) and from that skill's Chronological Document Summary companion (PDF, year-grouped, Authority/Parties column) — this is the lightest-weight variant: same judgments, date order, markdown.
argument-hint: "[case name or Drive/folder link]"
---

# /reading-order-chronological-md — Chronological Reading Order as Markdown

## What this produces

A single **Markdown file** listing every document in the matter **in date order** (earliest
first, grouped by year), with the same substance fields the standard `reading-order` skill
uses — but as plain `.md`, not a `.docx` table or a designed PDF. Use this when Arya wants
something quick to read in a text editor, paste into a chat, or version-control, rather than
a formatted deliverable.

This does **not** replace:
- `reading-order` (standalone) — the understanding-ordered `.docx` table, the default RO.
- `reading-order`'s Chronological Document Summary companion — the fully designed,
  year-grouped, colour-coded PDF with an Authority/Parties column, for a filing-facing
  chronological deliverable.

Use this skill specifically when the ask is "chronological" **and** "as an .md file" (or
functionally equivalent — "just give me the text", "markdown is fine", "don't bother with a
PDF"). If Arya wants a polished, shareable chronological document, point her to the standard
skill's companion output instead.

## Step 1 — Gather ALL the documents (read them, don't guess)

Same discipline as `reading-order` Step 1:

- Read every document — don't infer type or content from filename alone (files are
  routinely mis-named).
- Check sub-folders. Cross-check any Drive/folder listing against a content search before
  trusting it's complete.
- Render and read scanned PDFs (no text layer) as images — nothing skipped.
- Note duplicates and mis-named files rather than dropping them silently.
- Build the tiered **"Documents Still Needed"** list (Critical / Needed to file the next
  step / Lower priority) exactly as `reading-order` Step 1 does — cross-referencing every
  document/deed/order/letter *mentioned inside* the documents you have against what's
  actually present. If the case already has a `client-document-intake` intake report or an
  existing reading order, keep this list in sync with it rather than maintaining a second
  divergent version.
- If a file is access-blocked or unreadable, list it and say so — never invent its content.

If a `<record>_intel/` workspace (from `large-legal-record-intelligence`) or a prior
`reading-order` run already exists for this case, reuse that per-document analysis instead
of re-reading — this skill is a re-sort of the same judgments, not a fresh read.

## Step 2 — Assign the substance fields per document

For every document, same three-field discipline as the standard skill (keep them distinct):

- **What it is** — type, author/party, date, in one plain line.
- **What it says** — the actual content: operative clause, finding, holding, load-bearing
  figure or date. What the reader takes away from it.
- **Implication** — the "so what" for this matter: evidential/strategic weight, what it
  supports or sets up next. Specific to the case, not generic.
- **Importance** — `Essential` / `High` / `Medium` / `Skim` (same four levels as the
  standard skill; keep `Essential` to a small handful — the documents that carry the case).

## Step 3 — Sort chronologically and group by year

- Sort strictly by each document's **own date** (execution date, order date, letter date) —
  not filing date, not folder order, not reading-order-for-understanding.
- Group entries under year headers (`## 2019`, `## 2021`, etc.). Optionally add a one-line
  theme per year if it helps the story read (e.g. `## 2021 — Booking and first default`).
- Documents with a range or descriptive date (e.g. "executed Dec 2020, registered
  01.01.2021") sort at the later/operative date; note the ambiguity inline.
- Undated documents go in a final `## Undated` section — never guess a date to force a sort
  position.
- Certified copies sit immediately beside the order/document they certify, even if their own
  certification date is later.

## Step 4 — Write the Markdown file

One entry per document, in this format:

```markdown
# Chronological Reading Order — <Case Name>
<Forum / matter type, one line>

## <Year>

### <dd.mm.yyyy> — <Document title/type>
**What it is:** <type, party, date>
**What it says:** <content — operative clause / finding / figure>
**Implication:** <so-what for this matter>
**Importance:** <Essential | High | Medium | Skim>

---

### <dd.mm.yyyy> — <Next document>
...

## Undated

### <Document title>
...

---

## Note
<Must-reads, flagged duplicates/mis-named files, access-blocked files.>

## Documents Still Needed

### Critical
- <item — which document in hand references it>

### Needed to file the next step
- <item>

### Lower priority / for completeness
- <item>
```

Dates in the file follow the orchestrator's `dd.mm.yyyy` authoring convention (the
document's own date, reproduced as extracted — don't reformat a source date that's written
differently, but the heading date used for sorting/display is `dd.mm.yyyy`).

## Step 5 — Save and hand off

- If the case has a `client-document-intake`-style folder (`Documents from Client/` /
  `Documents by us/`), save to:
  `Documents by us/Chronological Reading Order — <Case Name>.md`
- Otherwise, save where Arya can get it (Downloads by default) and tell her the exact path.
- Tell her: document count, date range covered, any undated items, and anything flagged
  under "Documents Still Needed."

## Relationship to other skills

- **reading-order** (standalone): shares Step 1's gathering discipline and Step 2's field
  definitions exactly. This skill only changes the *sort order* (chronological vs
  understanding) and the *output format* (`.md` vs `.docx`/PDF). If Arya later wants the
  polished, year-grouped PDF version with colour-coded importance and an Authority/Parties
  column, that's `reading-order`'s Chronological Document Summary companion, not this skill
  — don't rebuild that PDF from scratch here; point back to the existing per-document
  analysis so nothing gets re-read.
- **client-document-intake / more-client-intake**: if intake has already run for this case,
  reuse its extractions and existing "Documents Still Needed" list rather than re-deriving.
- **large-legal-record-intelligence**: if the case has an `_intel/` workspace, source this
  skill's per-document judgments from its Layer 2 chronology and document-register indexes
  instead of re-reading the record.
