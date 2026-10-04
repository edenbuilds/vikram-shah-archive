# Product PRD: her reading work, in every format

Date: 04-10-2026. Owner: Omkar. User: Arya, an advocate who reads paper books in LiquidText and PDFgear.

## Problem

Her reading work lives in other apps. In LiquidText that means highlights, pen marks, bookmarks, tags and excerpts. In PDFgear and Acrobat it means highlights and comments. Case Companion only knew the paper's text. Her work did not come with the paper, and nothing she did here reached LiquidText. Big paper books (over 50 MB) were cut into arbitrary parts.

## What she gets

1. **Upload anything.** PDF, LiquidText project (.ltproj, or .ltproj.zip from Safari), Word, Markdown, text, Excel or CSV, JPG, PNG or HEIC photos. One upload is one paper. A LiquidText project with several documents is one paper with a bookmark per document.
2. **Her bookmarks are the contents.** The PDF's own bookmarks, nested as she made them, sit beside the paper. LiquidText bookmarks nest under each document's title.
3. **Bookmarks | Annotations panel, laid out like PDFgear.** It has two tabs. Bookmarks shows titles on the left and the PDF page on the right, with the current section in bold. Annotations lists every note in page order and can be filtered by Notes, Highlights, Ink and Tags. On a phone the panel opens as a bottom sheet from a Bookmarks button, and tapping a row opens that page and closes the sheet.
4. **Her highlights on the page.** A highlight from a PDF or from LiquidText's highlighter is drawn on the page scan in her colour. Its quote is the exact words under it: from the PDF's text, or from the page transcript when LiquidText kept only the shape. If the words cannot be matched exactly, the quote is left empty rather than guessed.
5. **Pen marks are placed, never read.** A pen mark says which page she marked. The app never says what a drawing says.
6. **Back out in any format.**
   - PDF as filed.
   - PDF with notes: her highlights as real PDF highlights in her colours, her notes as comments, her bookmarks. It opens in LiquidText, PDFgear, Acrobat and Preview.
   - Word, Markdown and text: the verbatim page text.
   - The whole matter as a ZIP.
7. **Round trip.** Upload the PDF with notes and the same highlights and notes come back. Add a note here, and the next export of any format carries it.
8. **Smaller files, never worse.** At filing, a scanned PDF is repacked losslessly (black-and-white scans as JBIG2 generic, structure repacked). The smaller file is kept only if every page renders to the same pixels and the text and bookmarks are identical. Example: a 616-page writ petition went from 28.1 MB to 19.4 MB.
9. **No size cap.** A paper book of any size is filed whole. Files over 50 MB are stored in pieces and joined on download.
10. **Through her AI app (MCP).** `get_notes`, `get_paper` and `read_pages` return the same notes, bookmarks and the PDF-with-notes link. Saving still needs a preview and her yes.

## Out of scope, and why

- **Writing .ltproj files.** The format is private and undocumented. A project written without LiquidText to test it against could open wrongly or lose her work. The PDF with notes is the supported way back into LiquidText.
- **Reading what pen marks say.** Handwriting recognition on her drawings would be a guess presented as her words.
- **Lossy compression.** Downsampling or JPEG recompression can blur a stamp or a figure. The court record has to stay exact.

## Success

- Every bookmark in the source appears, nested, with the right page.
- Every LiquidText highlight with text lands on the right page with LiquidText's words or the transcript's verbatim words.
- Every page she inked in LiquidText is listed. This is cross-checked against LiquidText's own flattened PDF export.
- No sideways scroll at 390px, and the phone sheet opens and navigates.
- Export, re-import and compare: the notes are unchanged.
