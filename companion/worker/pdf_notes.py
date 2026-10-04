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
            h, w = float(pg.mediabox.height), float(pg.mediabox.width)
            for a in pg.get("/Annots") or []:
                a = a.get_object()
                kind, body = a.get("/Subtype"), " ".join(str(a.get("/Contents") or "").split())
                if kind in MARKUP:
                    # one quad (8 numbers) per highlighted line; cut each line on its own so a
                    # multi-line highlight never picks up the rest of its first and last lines
                    q = [float(v) for v in (a.get("/QuadPoints") or [])]
                    quads = [q[k:k + 8] for k in range(0, len(q) - 7, 8)] or [[float(v) for v in a["/Rect"]] * 2]
                    quote = " ".join(filter(None, (words_under(pdf, i, [min(x[0::2]), min(x[1::2]), max(x[0::2]), max(x[1::2])], h) for x in quads)))
                    c = [float(v) for v in (a.get("/C") or [1, 1, 0])][:3]
                    out.append({"page": i, "quote": quote or None, "body": body or "(highlight)",
                                # the same top-left fractions as LiquidText ink, so the scan overlay and the export share them
                                "rects": [[round(min(x[0::2]) / w, 4), round((h - max(x[1::2])) / h, 4), round((max(x[0::2]) - min(x[0::2])) / w, 4),
                                           round((max(x[1::2]) - min(x[1::2])) / h, 4)] for x in quads],
                                "color": "#" + "".join(f"{round(v * 255):02x}" for v in (c + [0, 0, 0])[:3])})
                elif kind == "/Square" and body:  # a pen mark's box (lib/pdf-comments.ts draws pen marks as outlines)
                    x0, y0, x1, y1 = [float(v) for v in a["/Rect"]]
                    c = [float(v) for v in (a.get("/C") or [0, 0, 0])][:3]
                    out.append({"page": i, "quote": None, "body": body.split(' "')[0],
                                "rects": [[round(x0 / w, 4), round((h - y1) / h, 4), round((x1 - x0) / w, 4), round((y1 - y0) / h, 4)]],
                                "color": "#" + "".join(f"{round(v * 255):02x}" for v in (c + [0, 0, 0])[:3])})
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
    return out + lt_marks(data) + [{"page": m["page"], "quote": None, "rects": m["rects"], "color": m["color"],
                                    "body": {True: "Highlighted in LiquidText", False: "Pen marks in LiquidText"}.get(m["highlighter"], "Marked in LiquidText (the mark's shape is not stored in the project)")} for m in ink_marks(data)]


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


def _pb(b: bytes) -> list[tuple[int, object]]:
    """Protobuf wire fields as (number, raw value): varints as int, 32/64-bit and length-delimited as bytes."""
    i, out = 0, []

    def vint():
        nonlocal i
        r = s = 0
        while True:
            c = b[i]
            i += 1
            r |= (c & 127) << s
            s += 7
            if c < 128:
                return r
    while i < len(b):
        k = vint()
        fn, wt = k >> 3, k & 7
        if wt == 0:
            out.append((fn, vint()))
        elif wt in (1, 5):
            n = 8 if wt == 1 else 4
            out.append((fn, b[i:i + n]))
            i += n
        elif wt == 2:
            n = vint()
            out.append((fn, b[i:i + n]))
            i += n
        else:
            raise ValueError(f"wire type {wt}")
    return out


def _num(d: dict, k: int) -> float:
    import struct
    v = d.get(k, b"")
    return struct.unpack("<f" if len(v) == 4 else "<d", v)[0] if len(v) in (4, 8) else 0.0


def strokes(blob: bytes):
    """(RGBA hex, [x, y, w, h]) per ink stroke, the box as fractions of the page from its top left.
    04-10-2026, decoded from a real project and checked against LiquidText's own flattened export:
    stroke field 1 = colour (fixed32 RGBA; alpha 7f = highlighter), field 2 = box {1: {x, y}, 2: {h, w}}."""
    for fn, s in _pb(blob):
        if fn != 1 or not isinstance(s, bytes):
            continue
        f = dict(_pb(s))
        box = dict(_pb(f.get(2, b"")))
        o, z = dict(_pb(box.get(1, b""))), dict(_pb(box.get(2, b"")))
        x, y, h, w = _num(o, 1), _num(o, 2), _num(z, 1), _num(z, 2)
        if w > 0 and h > 0:
            yield dict(_pb(f.get(1, b""))).get(1, b"").hex() or "000000ff", [round(x, 4), round(y, 4), round(w, 4), round(h, 4)]


def passages(rects: list[list[float]]) -> list[list[list[float]]]:
    """Strokes grouped into passages: top to bottom, a new passage where the gap exceeds two lines."""
    rs = sorted(rects, key=lambda r: (r[1], r[0]))
    out: list[list[list[float]]] = []
    for r in rs:
        if out and r[1] - (out[-1][-1][1] + out[-1][-1][3]) < 2 * max(r[3], out[-1][-1][3]):
            out[-1].append(r)
        else:
            out.append([r])
    return out


def ink_marks(data: bytes) -> list[dict]:
    """Her LiquidText ink on the merged PDF: {page, color, highlighter, rects} per passage."""
    e, start = _project(data)
    if not e:
        return []
    z = zipfile.ZipFile(io.BytesIO(data))
    blobs = {n.lower(): n for n in z.namelist()}
    surf = {s["Id"].lower(): s for s in e.get("InkSurfaces", []) if s.get("Id")}
    by: dict[tuple[int, str], list] = {}
    for a in e.get("InkSubArchives", []):
        s = surf.get(str(a.get("ParentInkSurface", "")).lower())
        # AttachedToType 1 = a document page; workspace and excerpt ink (3, 107) has no page in the paper
        if not s or s.get("AttachedToType") != 1 or s.get("OptionalPageIndex", -1) < 0 or str(s.get("AttachedTo", "")).lower() not in start:
            continue
        page = start[s["AttachedTo"].lower()] + s["OptionalPageIndex"] + 1
        # exact Blobs/fobjz<uid>z<n>; a substring match once picked a PDF blob whose name held the uid
        uid = str(a.get("ObjUID", "")).lower()
        blob = next((n for low, n in blobs.items() if uid and low.rsplit("/", 1)[-1].startswith(f"fobjz{uid}z")), None)
        try:
            got = list(strokes(z.read(blob))) if blob else []
        except (ValueError, IndexError):  # not stroke data: place the page only
            got = []
        for color, r in got:
            by.setdefault((page, color), []).append(r)
        if not got:
            # 04-10-2026: a real project listed strokes on 3 pages with no stroke data in the file (LiquidText's
            # own export shows a highlight there). The place is kept; the shape is not invented.
            by.setdefault((page, ""), [])
    return [{"page": pg, "color": "#" + c[:6], "highlighter": c[6:8] != "ff", "rects": g}
            for (pg, c), rs in sorted(by.items()) if c for g in passages(rs)] + \
           [{"page": pg, "color": None, "highlighter": None, "rects": []} for (pg, c) in sorted(by) if not c and not any(k[0] == pg and k[1] for k in by)]


def ink_pages(data: bytes) -> list[int]:
    return sorted({m["page"] for m in ink_marks(data)})


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
                "InkSubArchives": [{"ObjUID": "A1", "ParentInkSurface": "S1"}],
                "InkSurfaces": [{"Id": "S1", "AttachedTo": ids[0][0].upper(), "AttachedToType": 1, "OptionalPageIndex": 1},
                                {"AttachedTo": ids[1][0], "AttachedToType": 1, "OptionalPageIndex": -1},
                                {"AttachedTo": "w", "AttachedToType": 3, "OptionalPageIndex": 0}],
                "Highlights": [{"AttachedTo": ids[0][0], "AttachedToType": 1, "HighlightedString": "The tenancy  was\nterminated",
                                "StableULCorner": base64.b64encode(b"\t" + struct.pack("<d", 0.2) + b"\x11" + struct.pack("<d", 1.33)).decode()}],
                "Tags": [{"AttachedTo": ids[1][0], "TagCategory": "Urgent", "TagName": ""}]}))
            z.writestr(f"Blobs/filez{ids[0][0]}z{ids[0][1]}", two.read_bytes())
            z.writestr(f"Blobs/filez{ids[1][0]}z{ids[1][1]}", out.read_bytes())
            ld = lambda fn, b: bytes([fn << 3 | 2, len(b)]) + b  # noqa: E731
            dbl = lambda fn, v: bytes([fn << 3 | 1]) + struct.pack("<d", v)  # noqa: E731
            stroke = ld(1, bytes([13]) + bytes.fromhex("ffff007f")) + ld(2, ld(1, dbl(1, 0.1) + dbl(2, 0.2)) + ld(2, dbl(1, 0.03) + dbl(2, 0.6)))
            z.writestr("Blobs/fobjza1z123", ld(1, stroke))
        data = buf.getvalue()
        merged = PdfReader(io.BytesIO(ltproj_pdf(data)))
        assert len(merged.pages) == 3 and [o.title for o in merged.outline if not isinstance(o, list)] == ["Order", "Appeal memo"]
        assert ink_pages(data) == [3], ink_pages(data)  # Order is 1 page, so the memo's page index 1 is page 3
        assert ink_marks(data) == [{"page": 3, "color": "#ffff00", "highlighter": True, "rects": [[0.1, 0.2, 0.6, 0.03]]}], ink_marks(data)
        assert lt_marks(data) == [{"page": 3, "quote": "The tenancy was terminated", "body": "(highlight)"},
                                  {"page": 1, "quote": None, "body": "LiquidText tag on this document: Urgent"}], lt_marks(data)
        assert worker.is_ltproj("Case.ltproj.zip") and worker.is_ltproj("x.LTPROJ") and not worker.is_ltproj("x.zip")
    print("pdf_notes self-check ok: highlight quote, sticky note, ltproj documents, excerpts and comments")
