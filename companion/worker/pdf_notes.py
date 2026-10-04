"""Her highlights and comments already inside an uploaded PDF (LiquidText's PDF export, Acrobat,
Preview, PDFGear), read so they arrive as her notes. 04-10-2026: Omkar asked to connect LiquidText,
which has no API; its PDF export keeps highlights and comments as standard PDF annotations.
A highlight's words are cut from the PDF's own text under the highlight, never typed or guessed;
when the PDF has no text there, the note keeps her comment and no quote. Also opens .ltproj files."""
from __future__ import annotations

import io
import subprocess
import zipfile
from pathlib import Path

MARKUP = {"/Highlight", "/Underline", "/StrikeOut", "/Squiggly"}
COMMENT = {"/Text", "/FreeText"}


def words_under(pdf: Path, page: int, rect: list[float], height: float) -> str:
    """Text inside a PDF-space rectangle, by poppler's crop (top-left origin, points at 72 dpi)."""
    x1, y1, x2, y2 = rect
    r = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-r", "72", "-x", str(int(x1)), "-y", str(int(height - y2)),
                        "-W", str(int(x2 - x1) + 1), "-H", str(int(y2 - y1) + 1), "-layout", str(pdf), "-"], capture_output=True, text=True)
    return " ".join(r.stdout.split())


def read(pdf: Path) -> tuple[list[dict], bool]:
    """([{page, quote, body}], made_by_liquidtext). Empty on any PDF it can't read; never fails a paper."""
    try:
        from pypdf import PdfReader
        r = PdfReader(str(pdf))
        meta = r.metadata or {}
        lt = "liquidtext" in f"{meta.get('/Producer', '')} {meta.get('/Creator', '')}".lower()
        out = []
        for i, pg in enumerate(r.pages, 1):
            h = float(pg.mediabox.height)
            for a in pg.get("/Annots") or []:
                a = a.get_object()
                kind, body = a.get("/Subtype"), " ".join(str(a.get("/Contents") or "").split())
                if kind in MARKUP:
                    q = a.get("/QuadPoints")
                    xs, ys = (q[0::2], q[1::2]) if q else ([a["/Rect"][0], a["/Rect"][2]], [a["/Rect"][1], a["/Rect"][3]])
                    quote = words_under(pdf, i, [float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))], h)
                    if quote or body:
                        out.append({"page": i, "quote": quote or None, "body": body or "(highlight)"})
                elif kind in COMMENT and body:
                    out.append({"page": i, "quote": None, "body": body})
        return out, lt
    except Exception:  # noqa: BLE001  annotations are a bonus; the paper is filed regardless
        return [], False


def ltproj_pdf(data: bytes) -> bytes:
    """A LiquidText project is a zip holding its documents. One PDF: that PDF. Several: one PDF with a
    bookmark per document, so each shows in the paper's contents. ponytail: excerpts, ink and
    workspace links inside the project are not read; export the PDF from LiquidText to keep those."""
    from pypdf import PdfReader, PdfWriter
    z = zipfile.ZipFile(io.BytesIO(data))
    pdfs = [n for n in z.namelist() if n.lower().endswith(".pdf") and not n.startswith("__MACOSX")]
    if not pdfs:
        raise RuntimeError("No PDF found inside this LiquidText project. In LiquidText use Export > PDF and upload that.")
    if len(pdfs) == 1:
        return z.read(pdfs[0])
    w = PdfWriter()
    for n in pdfs:
        start = len(w.pages)
        w.append(PdfReader(io.BytesIO(z.read(n))))
        w.add_outline_item(Path(n).stem, start)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


if __name__ == "__main__":
    # Self-check: a PDF with real text and a highlight over "Writ Petition" plus a sticky note,
    # then the same PDF inside a two-document .ltproj zip.
    import tempfile
    from pypdf import PdfReader, PdfWriter
    from pypdf.annotations import Highlight, Text
    from pypdf.generic import ArrayObject, FloatObject
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "t.pdf"
        html = Path(d) / "t.html"
        html.write_text("<p style='font:24px serif;margin:0'>Writ Petition No. 12 of 2026</p>")
        import worker  # its Chrome print gives a real text layer
        worker.html_pdf(html, src)
        w = PdfWriter(clone_from=str(src))
        h = float(w.pages[0].mediabox.height)
        rows = subprocess.run(["pdftotext", "-bbox", str(src), "-"], capture_output=True, text=True).stdout
        import re
        boxes = [tuple(map(float, m[:4])) for m in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(Writ|Petition)<', rows)]
        x1, y1, x2, y2 = min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)
        rect = (x1, h - y2, x2, h - y1)
        quad = ArrayObject([FloatObject(v) for v in (x1, h - y1, x2, h - y1, x1, h - y2, x2, h - y2)])
        w.add_annotation(0, Highlight(rect=rect, quad_points=quad))
        w.add_annotation(0, Text(rect=(10, 10, 30, 30), text="Check the date of filing"))
        w.add_metadata({"/Producer": "LiquidText 3"})
        out = Path(d) / "a.pdf"
        w.write(out)
        notes, lt = read(out)
        assert lt, "LiquidText producer seen"
        assert notes[0]["quote"] == "Writ Petition", notes
        assert notes[1] == {"page": 1, "quote": None, "body": "Check the date of filing"}, notes
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("Documents/one.pdf", out.read_bytes())
            z.writestr("Documents/two.pdf", out.read_bytes())
        merged = PdfReader(io.BytesIO(ltproj_pdf(buf.getvalue())))
        assert len(merged.pages) == 2 and [o.title for o in merged.outline] == ["one", "two"]
    print("pdf_notes self-check ok: highlight quote, sticky note, ltproj")
