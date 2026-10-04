---
name: liquidtext-bridge
description: Move papers and her reading work between LiquidText and Case Companion. Use when she mentions LiquidText, a .ltproj project, excerpts, or wants her notes to open in another PDF app. LiquidText has no API, so everything goes through files she uploads or downloads.
---

# LiquidText bridge

LiquidText has no API. The bridge is files, in both directions.

## From LiquidText into Case Companion (she uploads on the Upload page)

- **A LiquidText project (.ltproj, or Name.ltproj.zip from Safari).** Every PDF in it is filed as one paper, with a bookmark per document. Her excerpts come in as notes quoted on the right page, but only where those exact words are on a page of the project's PDFs. Her comments come in as notes. Ink and the workspace layout are not read.
- **A PDF exported from LiquidText (Export > PDF), or from Acrobat, Preview or PDFGear.** Its highlights become notes, each quoting the words under the highlight, cut from the PDF itself. Its comments become notes.
- Notes from a PDF carry the tag `from-pdf` (plus `liquidtext` when LiquidText made the file); notes from a project carry `from-ltproj` and `liquidtext`. `get_notes` shows them. Where she drew with LiquidText's pen, the project gives a note "Pen marks in LiquidText on this page": the place only. The strokes are drawings; never describe or guess what they say. Her LiquidText bookmarks arrive as the paper's contents, nested under each document's title.

## From Case Companion into LiquidText

- `get_paper` gives a "PDF with her notes as comments" link (`.../download/liquidtext`). It is the paper's own PDF with her notes and bookmarks added as standard PDF comments. She opens it in LiquidText (Import > Files) or any PDF reader.
- A LiquidText project file is not produced. The .ltproj format is private, and a guessed one would not open.

## Rules

- Excerpts and highlights are her work product, not the record. Cite the paper's page for any fact, and run `verify_quote` as usual.
- If an imported note has no page, say "unplaced note from LiquidText". Never guess its page.
- Never reconstruct a quote from a LiquidText note that the paper does not contain.
