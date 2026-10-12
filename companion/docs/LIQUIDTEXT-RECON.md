# LiquidText recon (13-10-2026)

Source: /Applications/LiquidText.app 7.3.17 (universal Mach-O), read statically. Class names from `strings`; full list in ~/rea/lt_strings.txt. Nothing executed or decompiled.

## What it is built on
- PDF rendering and text selection: PSPDFKit (now Nutrient), a paid SDK. LiquidText did not write its own PDF text layer.
- Sync: CRDT (`LTCRDT*`, `LTCollaborationWorkspacePageModelAdapter`), Azure Mobile backend.

## Data model (names from the binary)
- `Workspace` > `WorkspacePages` > `WorkspacePageModel`: the canvas, which can have several pages.
- `Excerpt` / `ExcerptAttachmentModel` / `ExcerptTextRoot`: a card that keeps a pointer back to its source span.
- `Comment` / `CommentAttachmentModel` / `CommentPositioner`: notes attached to a span and laid out beside it.
- `LinkEndpointAttachmentModel` / `LTlinkEndpointView` / `InkLinkModel`: a link is two endpoints, each attached to a span or card.
- `LTCollapseGestureRecognizer` / `LTcollapseGapView` / `LTcollapseSegmentDataStruct`: pinch-to-collapse hides the page ranges between two points.
- `LTworkspaceSearcher` / `LTexcerptSearchResult`: search runs over the documents and the excerpts.
- `LTPDFExportHelper` / `LTnotesExportHelper` / `LTwhichDocsToExportVC`: notes are exported separately from the annotated PDF.

## What this means for the companion
1. Everything hangs off one primitive: an anchor, meaning paper, page and character range in the OCR text, plus word boxes. Excerpts, comments and link endpoints are rows that point at an anchor. lib/highlight.ts already stores character offsets, so word boxes are the missing piece.
2. The text layer: our papers are scans, so OCR word boxes do the job PSPDFKit's text layer does for LiquidText. The next build step is word-position OCR, stored once per page.
3. Collapse is just "hide pages/lines between A and B" in the continuous Workspace scroll. It needs no new data.
4. Notes export: build from the anchor rows. The PDF export already exists in lib/pdf-comments.ts.
