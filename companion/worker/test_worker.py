"""python3 worker/test_worker.py - section page ranges come from real page markers."""
from worker import sectioned

texts = ["APPLICATION UNDER SECTION 17\nThe Claimant prays as follows."] + [f"Body text of page {i}." for i in range(2, 11)]
texts[4] = "ANNEXURE A\nCopy of the sale deed."   # page 5
texts[7] = "ANNEXURE B\nCopy of the receipt."     # page 8
texts[9] = ""                                     # page 10: nothing readable

body, secs = sectioned("Test application", texts)
got = [(s["mark"], s["pageStart"], s["pageEnd"]) for s in secs]
assert [(a, b) for _, a, b in got] == [(1, 4), (5, 7), (8, 10)], got
assert "ANNEXURE A" in got[1][0] and "ANNEXURE B" in got[2][0], got
assert body.count("[ILLEGIBLE") == 1 and "## Page 10 of 10" in body
print("worker section mapping ok:", got)

# Every accepted format comes out as a PDF whose text layer carries the words as written.
import subprocess, tempfile
from pathlib import Path
from worker import as_pdf
with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    md = b"# Order dated 12.03.2024\n\nThe appeal is **allowed**.\n"
    (tmp / "s.html").write_text("<p>Reply dated 01.02.2025 filed by the Society.</p>")
    subprocess.run(["textutil", "-convert", "docx", str(tmp / "s.html"), "-output", str(tmp / "s.docx")], check=True)
    subprocess.run(["sips", "-s", "format", "png", "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns", "--out", str(tmp / "s.png")], check=True, capture_output=True)
    for name, data, want in [("n.md", md, "12.03.2024"), ("n.txt", b"Plain note 05.06.2023", "05.06.2023"),
                             ("r.docx", (tmp / "s.docx").read_bytes(), "01.02.2025"), ("p.png", (tmp / "s.png").read_bytes(), None),
                             ("junk.pdf", b"\r\n%PDF-1.4 rest", None)]:
        pdf = as_pdf(data, tmp, name)
        assert pdf.startswith(b"%PDF-"), name
        if want:
            (tmp / "o.pdf").write_bytes(pdf)
            assert want in subprocess.run(["pdftotext", str(tmp / "o.pdf"), "-"], capture_output=True, text=True).stdout, name
    try:
        as_pdf(b"not a pdf", tmp, "fake.pdf"); raise AssertionError("fake pdf accepted")
    except RuntimeError as e:
        assert "not a readable PDF" in str(e)
print("worker formats ok: md, txt, docx, png, pdf with a preamble")


# her own OCR text lines up with the scan's pages, or is not used at all
from worker import split_ocr  # noqa: E402
assert split_ocr("one\ftwo\fthree\f", 3) == ["one", "two", "three"]
assert split_ocr("--- Page 1 ---\nalpha\n--- Page 2 ---\nbeta", 2) == ["\nalpha\n", "\nbeta"]
assert split_ocr("[Page 1 of 2]\na\nPage 2\nb", 2) == ["\na\n", "\nb"]
assert split_ocr("one\ftwo", 3) is None  # 2 pages of text for a 3-page scan: read the scans instead
assert split_ocr("Page 2\nb\nPage 1\na", 2) is None  # out of order
assert split_ocr("just one page", 1) == ["just one page"]
print("worker given OCR ok")

# Her PDF bookmarks become the paper's contents, nested, with page ranges
from pypdf import PdfWriter  # noqa: E402
from worker import bookmarks  # noqa: E402
_w = PdfWriter()
for _ in range(6):
    _w.add_blank_page(100, 100)
_a = _w.add_outline_item("Petition", 0)
_w.add_outline_item("Prayer", 2, parent=_a)
_w.add_outline_item("Exhibit A", 4)
_bm = Path(tempfile.mkdtemp()) / "bm.pdf"
_w.write(str(_bm))
_rows = bookmarks(_bm, 6)
assert [(r["numeral"], r["title"], r["pages"], r["level"]) for r in _rows] == [("1", "Petition", "1-4", 0), ("", "Prayer", "3-4", 1), ("2", "Exhibit A", "5-6", 0)], _rows
_plain = Path(tempfile.mkdtemp()) / "plain.pdf"
_p = PdfWriter(); _p.add_blank_page(100, 100); _p.write(str(_plain))
assert bookmarks(_plain, 1) == []
print("worker bookmarks ok")

# MarkItDown formats: an Excel sheet comes out as a PDF whose text layer still has every cell.
from openpyxl import Workbook  # noqa: E402
import io  # noqa: E402
_wb = Workbook(); _ws = _wb.active
_ws.append(["Hearing", "Date"]); _ws.append(["Final arguments", "12-11-2026"])
_buf = io.BytesIO(); _wb.save(_buf)
_xt = Path(tempfile.mkdtemp())
_xp = _xt / "x.pdf"; _xp.write_bytes(as_pdf(_buf.getvalue(), _xt, "schedule.xlsx"))
_xtext = subprocess.run(["pdftotext", str(_xp), "-"], capture_output=True, text=True).stdout
assert "Final arguments" in _xtext and "12-11-2026" in _xtext, _xtext[:300]
print("worker markitdown ok: xlsx")
