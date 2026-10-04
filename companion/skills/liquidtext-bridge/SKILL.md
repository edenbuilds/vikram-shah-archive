---
name: liquidtext-bridge
description: Move papers and her reading work between LiquidText and Case Companion. Use when she mentions LiquidText, a .ltproj project, excerpts, or wants her notes to open in another PDF app. LiquidText has no API, so everything goes through files she uploads or downloads.
---

# LiquidText bridge

LiquidText has no API. The bridge is files, in both directions.

## From LiquidText into Case Companion (she uploads on the Upload page)

- **A LiquidText project (.ltproj, or Name.ltproj.zip from Safari).** Every PDF in it is filed as one paper, with a bookmark per document. Her excerpts come in as notes quoted on the right page, but only where those exact words are on a page of the project's PDFs. Her comments come in as notes. Her highlighter and pen marks are placed on their pages; the workspace layout is not read.
- **A PDF exported from LiquidText (Export > PDF), or from Acrobat, Preview or PDFGear.** Its highlights become notes, each quoting the words under the highlight, cut from the PDF itself. Its comments become notes.
- Notes from a PDF carry the tag `from-pdf` (plus `liquidtext` when LiquidText made the file); notes from a project carry `from-ltproj` and `liquidtext`. `get_notes` shows them. Her LiquidText highlights arrive as notes with body "(highlight)" and the highlighted words as the quote (LiquidText's own reading of the page; run verify_quote before relying on them). An area highlighted over a scan with no words recorded says so; read that page with read_pages instead of guessing. A LiquidText tag sits on its document's first page as "LiquidText tag on this document: ...". Where she swept LiquidText's highlighter over a passage, the note is "Highlighted in LiquidText" with the shape of the mark (shown in her colour on the page scan) and, as the quote, the verbatim words of the page's transcript that lie under it; when those words cannot be matched exactly the quote is left empty, never guessed. Pen strokes come in as "Pen marks in LiquidText", and a page she marked whose strokes the project did not keep as "Marked in LiquidText (the mark's shape is not stored in the project)": the place only. Never describe or guess what a drawing says. Her LiquidText bookmarks arrive as the paper's contents, nested under each document's title.

## From Case Companion into LiquidText

- `get_paper` gives a "PDF with her notes as comments" link (`.../download/liquidtext`). It is the paper's own PDF with her highlights redrawn as real PDF highlights in her colours, her notes as comments, and her bookmarks. She opens it in LiquidText (Import > Files), PDFgear, Acrobat or Preview. Uploading that PDF again brings the same highlights and notes back.
- A LiquidText project file is not produced. The .ltproj format is private and undocumented; a project written without LiquidText to test it against could open wrongly or lose her work, so the PDF above is the way back in.

## Rules

- Excerpts and highlights are her work product, not the record. Cite the paper's page for any fact, and run `verify_quote` as usual.
- If an imported note has no page, say "unplaced note from LiquidText". Never guess its page.
- Never reconstruct a quote from a LiquidText note that the paper does not contain.
