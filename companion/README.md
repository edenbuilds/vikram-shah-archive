# Case Companion

The advocate's private study companion. It reads the same corpus as the public
reading room (`../public`) and adds a private, per-matter layer on top: annotations,
collections, a working chronology, hearing notes → reviewed minutes, source-pinned Q&A,
uploads for new matters, and an MCP server for Claude Code / Cursor.

The public reader is untouched and not on this app's path. It reads the public `archive`
bucket and uses no tables. `companion/` is excluded from its Vercel deploy (`../.vercelignore`).

## Guarantees (enforced in code, not just the prompt)

| Rule | Where |
| --- | --- |
| Verbatim source never edited in place | RLS: `documents`, `document_pages` and `chunks` have **no** user write policies; only the service-role worker writes them |
| Advocate's layer is separate and looks different | `annotations`, `chronology_entries`, … own tables; `.note` / `.own` styles and "Advocate's note" labels |
| No citation, no answer | `lib/citations.ts`: every claim needs a quote that is a verbatim span of a retrieved chunk, and every figure in the claim must appear in that quote. Otherwise it's withheld and logged |
| Out of corpus means refuse | Retrieval floor in `lib/qa.ts`, and the model may return `not_in_corpus`; the UI shows "Not found in the papers on file" |
| Audit | `qa_messages.retrieved` stores every chunk the model saw, plus withheld statements |
| Minutes are drafts until reviewed | `hearing_notes.reviewed_by_advocate`; only `confirmMinutes` feeds the chronology or creates the next hearing |
| Per-matter access | `matter_members` by login email + `is_member()` in every policy; `app_users` gates who may create matters |
| No fabricated OCR | Worker: per-page density pick (PDF text layer vs Google Vision); empty pages become `[ILLEGIBLE: …]` |

## Setup

`.env.local` (gitignored):

```
LLM_MODEL=grok-4.3     # or deepseek-flash
DEEPSEEK_API_KEY=...
XAI_API_KEY=...        # grok models and volume indexing
OPENAI_API_KEY=...     # embeddings only (text-embedding-3-small)
NEXT_PUBLIC_SUPABASE_URL=https://mnsmfobozohejvnmnalw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...        # dashboard → Settings → API
SUPABASE_URL=https://mnsmfobozohejvnmnalw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...                   # worker, loader, MCP, eval only; never shipped to the browser
SUPABASE_DB_URL=postgresql://...                # migrations only
```

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_companion.sql
```

Create the advocate's login in the Supabase dashboard (Auth → Users → Add user), then:

```bash
python3 worker/load_archive.py --owner advocate@example.com   # mirror the archive matter
npm run dev                                                   # http://localhost:3060
npm run worker                                                # processes uploads (needs poppler, gcloud ADC)
```

Compiled court volumes (a petition with all its exhibits in one 800-page PDF) are filed as
separate papers instead: OCR the volume once, write a manifest mapping the volume's own index to
PDF page ranges, validate, then file.

```bash
python3 worker/ocr_volume.py volume.pdf cache/vol1 6           # Google Vision, cached, resumable
python3 worker/split_volume.py manifest.json --check           # every page in exactly one paper
python3 worker/split_volume.py manifest.json                   # create matter, file each paper
```

A manifest is `{matter: {id, title, kind, forum, cause, stages, disclaimer, people}, volumes:
[{pdf, cache, parts: [{title, stage, from, to} | {title, stage, ranges: [[a, b], ...]}]}]}`.

## Checks

```bash
npm test          # citation verifier + transcript offsets + chunker
npm run eval:qa   # real questions vs the real corpus: answered ones must be pinned, off-corpus ones refused
npm run build
```

The RLS dry run (16 checks, including "member cannot edit transcript" and "stranger sees nothing")
runs against a local Postgres with stubbed `auth`/`storage`; see the commit that added this app.

## MCP (Claude Code / Cursor)

```bash
claude mcp add case-companion -- node --env-file=$PWD/.env.local $PWD/mcp/server.mjs
```

Tools: `list_matters`, `search_documents(matter, query)`, `get_document(doc_id)`,
`get_transcript(doc_id, page_start?, page_end?)`, `get_chronology(matter)`, `get_annotations(doc_id)`.
Every result is verbatim text pinned `[doc_id p. N]`. Notes are labelled `ADVOCATE'S NOTE`.
It uses the service role; set `COMPANION_MATTERS=a,b` to narrow it.

## Not built (on purpose)

No drafting of pleadings or arguments, no outcome prediction, no multi-tenant admin UI.
Audio transcription of hearings comes later (typed capture ships first).
