# Technical PRD: notes, LiquidText projects, lossless shrink, no size cap

Date: 04-10-2026. Code: `companion/` in `edenbuilds/vikram-shah-archive`.

## Ingestion (worker, runs on the Mac via launchd)

`worker/worker.py process()`:
1. `fetch_upload` rejoins the browser's 6 MB pieces. The original is stored under `originals/`, in 40 MB pieces when it is big (`corpus.storage_put`).
2. `as_pdf`: a LiquidText project is detected before the `%PDF-` sniff. Everything else goes through LibreOffice, MarkItDown or sips (HEIC) into a PDF.
3. `bookmarks()` reads the PDF outline. `pdf_notes.read()` reads Highlight/Text annotations: the quote is the words under the quads; `rects` and `color` are kept.
4. For a LiquidText project, `pdf_notes.ltproj_notes()` reads the project.
5. OCR chain per page: Google Vision, then LlamaParse, then the local engines in `worker/local_ocr.py`.
6. Highlighter strokes with no words get `ink_words()`. Tesseract TSV words inside the stroke boxes are snapped to the transcript with difflib at a ratio of at least 0.8, and the quote is the verbatim transcript span or None.
7. `shrink()` runs when we store the PDF ourselves. It uses OCRmyPDF `--skip-text -O1` with jbig2enc, or qpdf, and is kept only if three checks pass: page hashes at 72 dpi grayscale, the text layer, and the outline (title, page). It must also save at least 5%.
8. Index split. A volume with an index is split into its papers. The model call is Bedrock Converse (`LLM_MODEL=bedrock:…kimi-k3@flex`) and every placement is proven against the page text. Otherwise the paper is filed whole at any size.
9. `file_notes()` writes annotations. It replaces earlier from-pdf/from-ltproj notes on a refile, and writes the sidecar `{matter}/pages/{doc}/ink.json` with `[{page, color, rects, body, quote, tags}]`, since the annotations table has no jsonb column. `to_parts()` remaps notes and bookmarks per split part.

## LiquidText 3 project format (reverse-engineered from real projects)

The project is a zip with `LTMetadata.json`, `Entities.json` and `Blobs/`.

| What | Where it lives and how it is read |
|---|---|
| Documents | `Documents[]`, ordered by ListIndex. FileContent is base64 protobuf whose field 1 is the file uuid. The blob is `Blobs/filez<docId>z<uuid>`, a PDF with no extension. FileContent None means a missing file and is skipped. |
| Highlights | `Highlights[]`. HighlightedString is LiquidText's text. AttachedTo is a document. StableULCorner is protobuf; field 2 (a double, tag 0x11) is the page index plus the y fraction. |
| Tags | `Tags[]`: TagCategory and optional TagName, attached to a document. |
| Ink | InkSurfaces (AttachedToType 1 means a page, with OptionalPageIndex) lead to InkSubArchives (ParentInkSurface). The blob is `Blobs/fobjz<archive uid>z<n>`, protobuf with repeated strokes {1: colour fixed32 RGBA, 2: box {origin x,y; size h,w} as fractions}. Alpha below ff means highlighter. Archives without a blob become page-only marks. |
| Excerpts | Position only, no text. LiquidText's own Notes.docx export is empty for them. |

## Storage without a size cap

- The Supabase plan caps any one object at 50 MB, project-wide. Raising the bucket limit does not lift it.
- Writes over 40 MB go to `<path>.part000…` (`worker/corpus.py storage_put`, `lib/pdf-file.ts putFile`), the same layout the uploader uses.
- Reads:
  - Server side, `readFile()` joins the pieces (the PDF-with-notes export).
  - Downloads try a signed URL first. If that fails, `pieceUrls()` and `joinerPage()` return a small page that fetches the pieces in the browser, joins them into a Blob and saves it or shows it with `?view`. A big file never passes through a serverless response.
  - The ZIP export manifest gives an array of piece URLs, and `ExportZip.tsx` joins them.

## Export

`app/m/[matter]/d/[doc]/download/[format]/route.ts`:
- `pdf` gives the stored file.
- `liquidtext` gives the stored PDF plus `withComments()` (`lib/pdf-comments.ts`): ink rects become Highlight annotations (QuadPoints, C colour, Contents), notes become Text annotations, bookmarks become an outline.
- `docx`, `md` and `txt` are built from the verbatim page text.

## UI

- `Outline.tsx` is the Bookmarks | Annotations panel: an inline card on desktop, a `<dialog>` bottom sheet at 960px and below. `kindOf()` classifies notes from their importer body text.
- `Transcript.tsx` (Reader) overlays `ink.json` rects on the page scan in her colours.

## Checks

| Check | What it covers |
|---|---|
| `worker/pdf_notes.py` self-check | Synthetic LiquidText layout: documents, nested outline, encoded stroke, highlight corner, tag |
| `worker/test_worker.py` | Bookmarks, MarkItDown, lossless shrink |
| `scripts/liquidtext-check.mjs` | Synthetic both-ways live test |
| `scripts/real-papers-check.mjs` | Upload real papers to `zz-upload-test`; panel at 1280 and 390, sheet, navigation, screenshots |
| `npx tsc --noEmit`, `node --test lib/*.test.ts` | Types and unit tests |

Run Python with `arch -arm64 /usr/local/bin/python3`. The npm script's python3 is x86 and fails on numpy and docx.

## Libraries assessed

| Library | Verdict |
|---|---|
| OCRmyPDF, jbig2enc, qpdf | Adopted for lossless shrink. |
| pypdf | Already in use. |
| PDFCraftTool/pdfcraft (AGPL-3.0, browser toolkit) | Reference only; the AGPL is not wanted in a client product. |
| megaparse | Last push 21-02-2025, so stale. |
| quivr | A RAG framework we already cover with pgvector and receipts. |
| PyMuPDF | AGPL, avoided. |
| embedpdf, react-pdf-highlighter | Options if an in-browser PDF annotation layer is ever wanted. |
