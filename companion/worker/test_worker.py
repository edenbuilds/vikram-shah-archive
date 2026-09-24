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
