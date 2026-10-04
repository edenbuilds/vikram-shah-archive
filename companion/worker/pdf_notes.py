"""Her highlights and comments already inside an uploaded PDF (LiquidText's PDF export, Acrobat,
Preview, PDFGear), read so they arrive as her notes. 04-10-2026: Omkar asked to connect LiquidText,
which has no API; its PDF export keeps highlights and comments as standard PDF annotations.
A highlight's words are cut from the PDF's own text under the highlight, never typed or guessed;
when the PDF has no text there, the note keeps her comment and no quote. Also opens .ltproj files."""
from __future__ import annotations

import io
import re
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
                    # one quad (8 numbers) per highlighted line; cut each line on its own so a
                    # multi-line highlight never picks up the rest of its first and last lines
                    q = [float(v) for v in (a.get("/QuadPoints") or [])]
                    quads = [q[k:k + 8] for k in range(0, len(q) - 7, 8)] or [[float(v) for v in a["/Rect"]] * 2]
                    quote = " ".join(filter(None, (words_under(pdf, i, [min(x[0::2]), min(x[1::2]), max(x[0::2]), max(x[1::2])], h) for x in quads)))
                    if quote or body:
                        out.append({"page": i, "quote": quote or None, "body": body or "(highlight)"})
                elif kind in COMMENT and body:
                    out.append({"page": i, "quote": None, "body": body})
        return out, lt
    except Exception:  # noqa: BLE001  annotations are a bonus; the paper is filed regardless
        return [], False


def project_pdfs(z: zipfile.ZipFile) -> list[str]:
    return sorted(n for n in z.namelist() if n.lower().endswith(".pdf") and "__MACOSX" not in n and not Path(n).name.startswith("."))


def project_docs(z: zipfile.ZipFile) -> list[tuple[str, str, str]]:
    """(title, zip member, LiquidText document id) per document, in her order.
    04-10-2026, read from a real LiquidText 3 project: Entities.json lists "Documents" (Title, ListIndex,
    FileContent = base64 protobuf whose field 1 is the file's uuid) and each PDF sits in
    Blobs/filez<docId>z<fileId> with no extension. Older or hand-zipped projects: any .pdf inside."""
    import base64
    import json
    names = z.namelist()
    ent = next((n for n in names if n.rsplit("/", 1)[-1] == "Entities.json"), None)
    docs = []
    if ent:
        for d in sorted(json.loads(z.read(ent)).get("Documents", []), key=lambda d: d.get("ListIndex", 0)):
            raw = base64.b64decode((d.get("FileContent") or "") + "==")
            fid = raw[2:2 + raw[1]].decode(errors="ignore").lower() if raw[:1] == b"\n" else ""
            blob = next((n for n in names if fid and fid in n.lower() and z.read(n)[:5] == b"%PDF-"), None)
            if blob:
                docs.append((d.get("Title") or Path(blob).stem, blob, d.get("Id", "").lower()))
    return docs or [(Path(n).stem, n, "") for n in project_pdfs(z)]


# Field names (lower case, Core Data's leading "z" dropped) that hold an excerpt's words or her comment.
# 04-10-2026: no public LiquidText project was found to read the real schema from, so nothing relies on
# where a field sits: an excerpt counts only if its exact words are on a page of the project's PDFs
# (which also gives its page); a comment is her own words and comes in unplaced unless it sits beside one.
EXCERPT_KEYS = {"text", "excerpt", "excerpttext", "content", "quote", "selectedtext", "highlightedtext", "string"}
COMMENT_KEYS = {"note", "notes", "comment", "comments", "commenttext", "notetext", "annotation", "body"}
norm = lambda t: " ".join(str(t).split()).lower()  # noqa: E731


def _records(z: zipfile.ZipFile, tmp: Path):
    """Every dict-like record in the project's JSON, plist and SQLite files, as {key: value}."""
    import json
    import plistlib
    import sqlite3

    def walk(x):
        if isinstance(x, dict):
            yield x
            for v in x.values():
                yield from walk(v)
        elif isinstance(x, list):
            for v in x:
                yield from walk(v)
    for n in z.namelist():
        low = n.lower()
        if "__MACOSX" in n or low.endswith("/"):
            continue
        raw = z.read(n)
        if low.endswith(".json"):
            try:
                yield from walk(json.loads(raw.decode("utf-8", "replace")))
            except ValueError:
                pass
        elif low.endswith(".plist") or raw[:8] == b"bplist00":
            try:
                yield from walk(plistlib.loads(raw))
            except Exception:  # noqa: BLE001
                pass
        elif raw[:16] == b"SQLite format 3\x00":
            f = tmp / f"db{abs(hash(n))}.sqlite"
            f.write_bytes(raw)
            con = sqlite3.connect(f)
            try:
                for (t,) in con.execute("select name from sqlite_master where type='table'"):
                    cur = con.execute(f'select * from "{t}"')
                    cols = [c[0] for c in cur.description]
                    for row in cur:
                        yield dict(zip(cols, row))
            finally:
                con.close()


def ltproj_notes(data: bytes, pdf: Path) -> list[dict]:
    """Her excerpts and comments from a .ltproj, as notes on the merged PDF (see ltproj_pdf)."""
    import tempfile
    n = int(re.search(r"(?m)^Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout).group(1))
    pages = [norm(subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", str(pdf), "-"], capture_output=True, text=True).stdout) for i in range(1, n + 1)]
    out, seen = [], set()
    with tempfile.TemporaryDirectory() as d:
        for rec in _records(zipfile.ZipFile(io.BytesIO(data)), Path(d)):
            fields = {k.lower().lstrip("z") if k.lower().startswith("z") and k[1:2].isupper() else k.lower(): v
                      for k, v in rec.items() if isinstance(k, str) and isinstance(v, str)}
            quote = next((v for k, v in fields.items() if k in EXCERPT_KEYS and len(v.split()) >= 4), None)
            page = next((i for i, t in enumerate(pages, 1) if quote and norm(quote) in t), None)
            if page is None:
                quote = None
            comment = next((v.strip() for k, v in fields.items() if k in COMMENT_KEYS and len(v.split()) >= 2 and v != quote), None)
            if not quote and not comment:
                continue
            key = (norm(quote or ""), norm(comment or ""))
            if key in seen:
                continue
            seen.add(key)
            out.append({"page": page, "quote": " ".join(quote.split()) if quote else None, "body": comment or "(excerpt)"})
    return out + lt_marks(data) + [{"page": i, "quote": None, "body": "Pen marks in LiquidText on this page"} for i in ink_pages(data)]


def ltproj_pdf(data: bytes) -> bytes:
    """A LiquidText project is a zip holding its documents. One PDF: that PDF. Several: one PDF with a
    bookmark per document (her own bookmarks nested under it), so each shows in the paper's contents.
    Her excerpts, comments and pen marks are read by ltproj_notes."""
    from pypdf import PdfReader, PdfWriter
    z = zipfile.ZipFile(io.BytesIO(data))
    docs = project_docs(z)
    if not docs:
        raise RuntimeError("No PDF found inside this LiquidText project. In LiquidText use Export > PDF and upload that.")
    if len(docs) == 1:
        return z.read(docs[0][1])
    w = PdfWriter()
    for title, blob, _ in docs:
        w.append(PdfReader(io.BytesIO(z.read(blob))), outline_item=title)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def _project(data: bytes):
    """(Entities.json as a dict, {document id: its first page in the merged PDF, 0-based})."""
    import json
    from pypdf import PdfReader
    z = zipfile.ZipFile(io.BytesIO(data))
    ent = next((n for n in z.namelist() if n.rsplit("/", 1)[-1] == "Entities.json"), None)
    if not ent:
        return {}, {}
    start, at = {}, 0
    for _, blob, did in project_docs(z):
        start[did] = at
        at += len(PdfReader(io.BytesIO(z.read(blob))).pages)
    return json.loads(z.read(ent)), start


def _page_of(corner: str) -> int | None:
    """LiquidText's "stable" corner: base64 protobuf, field 1 = x across the page (0-1), field 2 =
    page index + y down the page. 04-10-2026: 0.20/112.33 sat on page 113 of a 270-page appeal."""
    import base64
    import struct
    b = base64.b64decode(corner + "==")
    i = b.find(b"\x11")  # field 2, 64-bit
    return int(struct.unpack("<d", b[i + 1:i + 9])[0]) if i >= 0 and len(b) >= i + 9 else None


def ink_pages(data: bytes) -> list[int]:
    """Pages (of the merged PDF) where she drew with LiquidText's pen. The strokes are drawings, not
    text, so only the place is recorded; nothing is read into them."""
    e, start = _project(data)
    # AttachedToType 1 = a document page; workspace and excerpt ink (3, 107) has no page in the paper
    return sorted({start[s["AttachedTo"].lower()] + s["OptionalPageIndex"] + 1
                   for s in e.get("InkSurfaces", [])
                   if s.get("AttachedToType") == 1 and s.get("OptionalPageIndex", -1) >= 0 and str(s.get("AttachedTo", "")).lower() in start})


def lt_marks(data: bytes) -> list[dict]:
    """Her highlights (LiquidText keeps the highlighted words as it read them) and tags, placed on the
    merged PDF. A tag hangs on a document, not a spot, so it sits on that document's first page."""
    e, start = _project(data)
    out = []
    for h in e.get("Highlights", []):
        did, words = str(h.get("AttachedTo", "")).lower(), " ".join(str(h.get("HighlightedString") or "").split())
        at = _page_of(h.get("StableULCorner") or "")
        # 04-10-2026: 24 of 36 highlights in a real project were areas drawn over scans, with no words;
        # the place is kept, the words are not guessed (OCR of that page has them, read it there)
        if did in start and at is not None:
            out.append({"page": start[did] + at + 1, "quote": words or None, "body": "(highlight)" if words else "Area highlighted in LiquidText (no words recorded)"})
    for t in e.get("Tags", []):
        did, label = str(t.get("AttachedTo", "")).lower(), " ".join(x for x in (t.get("TagCategory"), t.get("TagName")) if x and str(x).strip())
        if did in start and label:
            out.append({"page": start[did] + 1, "quote": None, "body": f"LiquidText tag on this document: {label}"})
    return out


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
        assert len(merged.pages) == 2 and [o.title for o in merged.outline if not isinstance(o, list)] == ["one", "two"]

        # A project whose excerpts and comments sit in JSON, a Core Data SQLite store and a plist (shapes
        # invented for the test; the reader keys on field names and the PDF's own words, not on layout).
        import json, plistlib, sqlite3
        html.write_text("<p style='font:20px serif'>Page one says nothing much.</p><p style='font:20px serif;break-before:page'>The tenancy was terminated by notice dated 01-03-2024 under section 106.</p>")
        two = Path(d) / "two.pdf"
        worker.html_pdf(html, two)
        db = Path(d) / "s.sqlite"
        con = sqlite3.connect(db)
        con.execute("create table ZEXCERPT (Z_PK int, ZTEXT text, ZNOTE text)")
        con.execute("insert into ZEXCERPT values (1, 'terminated by notice dated 01-03-2024', 'Notice period looks short')")
        con.commit(); con.close()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("Case.ltproj/Documents/two.pdf", two.read_bytes())
            z.writestr("Case.ltproj/Entities.json", json.dumps({"items": [{"type": "excerpt", "excerptText": "under section 106.", "comment": "short excerpt, kept as a comment only"},
                                                                  {"text": "words that appear nowhere in the paper", "note": "Ask the client"}]}))
            z.writestr("Case.ltproj/store.sqlite", db.read_bytes())
            z.writestr("Case.ltproj/meta.plist", plistlib.dumps({"Excerpts": [{"text": "The tenancy was terminated", "comment": "Key fact"}]}, fmt=plistlib.FMT_BINARY))
            z.writestr("Case.ltproj/LTMetadata.json", json.dumps({"title": "Legal Case Review", "liquidtext_version": "4.2.1"}))
        data = buf.getvalue()
        merged_pdf = Path(d) / "m.pdf"
        merged_pdf.write_bytes(ltproj_pdf(data))
        got = sorted(ltproj_notes(data, merged_pdf), key=lambda x: x["body"])
        assert got == [
            {"page": None, "quote": None, "body": "Ask the client"},
            {"page": 2, "quote": "The tenancy was terminated", "body": "Key fact"},
            {"page": 2, "quote": "terminated by notice dated 01-03-2024", "body": "Notice period looks short"},
            {"page": None, "quote": None, "body": "short excerpt, kept as a comment only"},
        ], got
        # The real LiquidText 3 layout (04-10-2026 sample, content replaced): Entities.json + extensionless
        # Blobs, ListIndex order, ink on page index 1 of the second-listed document.
        import base64, struct, uuid
        ids = [(str(uuid.uuid4()), str(uuid.uuid4())) for _ in range(2)]
        fc = lambda f: base64.b64encode(b"\n$" + f.upper().encode()).decode()  # noqa: E731
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("LTMetadata.json", json.dumps({"Version": "3", "ProjName": "x"}))
            z.writestr("Entities.json", json.dumps({
                "Documents": [{"Id": ids[0][0], "Title": "Appeal memo", "ListIndex": 1, "FileContent": fc(ids[0][1])},
                              {"Id": ids[1][0], "Title": "Order", "ListIndex": 0, "FileContent": fc(ids[1][1])}],
                "InkSurfaces": [{"AttachedTo": ids[0][0].upper(), "AttachedToType": 1, "OptionalPageIndex": 1},
                                {"AttachedTo": ids[1][0], "AttachedToType": 1, "OptionalPageIndex": -1},
                                {"AttachedTo": "w", "AttachedToType": 3, "OptionalPageIndex": 0}],
                "Highlights": [{"AttachedTo": ids[0][0], "AttachedToType": 1, "HighlightedString": "The tenancy  was\nterminated",
                                "StableULCorner": base64.b64encode(b"\t" + struct.pack("<d", 0.2) + b"\x11" + struct.pack("<d", 1.33)).decode()}],
                "Tags": [{"AttachedTo": ids[1][0], "TagCategory": "Urgent", "TagName": ""}]}))
            z.writestr(f"Blobs/filez{ids[0][0]}z{ids[0][1]}", two.read_bytes())
            z.writestr(f"Blobs/filez{ids[1][0]}z{ids[1][1]}", out.read_bytes())
            z.writestr(f"Blobs/fobjz{ids[0][0]}z123", b"\n\x05\r\xff\xff")
        data = buf.getvalue()
        merged = PdfReader(io.BytesIO(ltproj_pdf(data)))
        assert len(merged.pages) == 3 and [o.title for o in merged.outline if not isinstance(o, list)] == ["Order", "Appeal memo"]
        assert ink_pages(data) == [3], ink_pages(data)  # Order is 1 page, so the memo's page index 1 is page 3
        assert lt_marks(data) == [{"page": 3, "quote": "The tenancy was terminated", "body": "(highlight)"},
                                  {"page": 1, "quote": None, "body": "LiquidText tag on this document: Urgent"}], lt_marks(data)
        assert worker.is_ltproj("Case.ltproj.zip") and worker.is_ltproj("x.LTPROJ") and not worker.is_ltproj("x.zip")
    print("pdf_notes self-check ok: highlight quote, sticky note, ltproj documents, excerpts and comments")
