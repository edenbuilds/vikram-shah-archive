---
name: notes-and-bookmarks
description: Read and save her sticky notes and page bookmarks on a paper. Use when she asks to note, flag, bookmark or mark a page, or asks what she noted or bookmarked. Every save is previewed first and made only on her yes.
---

# Notes and bookmarks

## Reading

- `get_notes` (one paper, or the whole matter) lists her sticky notes and bookmarks.
  - Tag `bookmark`: a named page bookmark.
  - Tag `from-pdf` or `liquidtext`: brought in from an uploaded file.
  - Tag `via-ai`: saved through an AI app.
- `get_paper` lists the paper's own PDF bookmarks (its contents) and hers, each with a page link.
- These are her work product. Say "your note" or "your bookmark", and never present one as the record.

## Saving (always preview first)

1. Call `add_note` WITHOUT `confirm`, with `doc_id`, `page` (the PDF page) and `note`.
   - For a bookmark, add `bookmark: true`; `note` is the bookmark's name, e.g. "Reply, para 12".
   - To pin a note to exact words, add `quote`. Copy it character for character from `read_pages`; if it is not on that page exactly, the save is refused.
2. Show her the preview. Save only after she says yes, by calling again with `confirm: true`.

## On the website

- Each page has "Bookmark page N as..." and a note box. Select words first to pin a note to them.
- Beside each paper (and behind the Bookmarks button on a phone) is one panel with two tabs, laid out like PDFgear:
  - **Bookmarks**: the PDF's own bookmarks, nested, with the PDF page on the right and the current section in bold; then "Bookmarked by you", each with a remove link.
  - **Annotations**: every note in page order, filtered by Notes, Highlights, Ink and Tags. Tapping one opens its page.
- Highlights brought in from a PDF or LiquidText are drawn on the page scan in her colours.
