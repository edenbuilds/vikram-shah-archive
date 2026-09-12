#!/usr/bin/env python3
"""Mirror the existing paper archive (public/archive.json + transcripts + page text)
into the companion tables as one matter. Read-only over the archive repo; writes only
to Postgres. Binaries stay where they are: the public `archive` bucket.

  python3 worker/load_archive.py --owner advocate@example.com [--only doc-id ...]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import corpus
from corpus import ARCHIVE_ROOT, rest, rpc

sys.path.insert(0, str(ARCHIVE_ROOT / "scripts"))
from assemble import pdftotext_pages  # noqa: E402  (reuse, don't re-implement)

REG = json.loads((ARCHIVE_ROOT / "public" / "archive.json").read_text())
TR = ARCHIVE_ROOT / "public" / "transcripts"
DL = ARCHIVE_ROOT / "public" / "downloads"
GOOGLE_OCR = ARCHIVE_ROOT / "work" / "google_ocr"

PAGE_MARK = re.compile(r"(?m)^## Page (\d+)(?: of \d+)?\s*$")
SECTION_MARK = re.compile(r"(?m)^<!-- SECTION: .*?\| PDF pages (\d+)(?:-(\d+))? -->\s*$")
ILLEGIBLE_ONLY = re.compile(r"^\s*\[ILLEGIBLE[^\]]*\]\s*$")


def split_marked(text: str, marks: re.Pattern) -> list[tuple[int, int, str]]:
    """Cut text at marker lines -> (page_start, page_end, body) per marked block."""
    ms = list(marks.finditer(text))
    out = []
    for i, m in enumerate(ms):
        body = text[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(text)]
        ps = int(m.group(1))
        pe = int(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else ps
        out.append((ps, pe, body.strip()))
    return out


def page_texts(doc: dict, transcript: str) -> tuple[list[str | None], str]:
    """Verbatim text per page, from the densest page-keyed source available."""
    n = doc["pages"]
    if PAGE_MARK.search(transcript):
        pages: list[str | None] = [None] * n
        for ps, _, body in split_marked(transcript, PAGE_MARK):
            if 1 <= ps <= n:
                pages[ps - 1] = body
        return pages, "transcript-page"
    vision = [GOOGLE_OCR / doc["id"] / f"page-{i:03d}.txt" for i in range(1, n + 1)]
    cands = []
    if all(p.exists() for p in vision):
        cands.append(([p.read_text(errors="replace").strip() for p in vision], "google-vision"))
    pdf = DL / doc["file"]
    if pdf.exists():
        cands.append((pdftotext_pages(pdf, n), "pdftotext"))
    if not cands:
        return [None] * n, "none"
    best, src = max(cands, key=lambda c: sum(len(t) for t in c[0]))
    return [t or None for t in best], src


def people(case: dict) -> list[tuple[str, str]]:
    # ponytail: registry fields are "Name, S/o ..." / "Hon'ble Sole Arbitrator, Name, Senior Advocate";
    # take the name part only and skip descriptive placeholders ("as named in the papers").
    out = [(case["claimant"].split(",")[0], "claimant"), (case["respondent4"].split(",")[0], "respondent")]
    for r in re.split(r",\s*(?:and\s+)?|\s+and\s+", case["respondents13"]):
        if r.strip() and "as named" not in r:
            out.append((r, "respondent"))
    parts = [p.strip() for p in case["forum"].split(",")]
    if len(parts) >= 2:
        out.append((parts[1], "arbitrator"))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", required=True, help="advocate's login email (workspace + matter member)")
    ap.add_argument("--only", nargs="*", help="doc ids to (re)load")
    a = ap.parse_args()
    case = REG["case"]
    mid = case["slug"]

    rest("POST", "matters", "on_conflict=id", [{
        "id": mid, "title": case["title"], "short": case["short"], "kind": "arbitration",
        "forum": case["forum"], "venue": case["venue"], "cause": case["cause"],
        "posture": case.get("lawNote"), "disclaimer": case["disclaimer"],
        "parties": {k: case[k] for k in ("claimant", "respondents13", "respondent4")},
        "stages": [{"id": b["id"], "title": b["title"], "note": b.get("note")} for b in REG["bundles"]],
        # Scans stay where the public reader serves them (see ../vercel.json), whichever
        # project holds the companion tables. Nothing is copied.
        "storage_base": "https://mnsmfobozohejvnmnalw.supabase.co/storage/v1/object/public/archive",
    }], "resolution=merge-duplicates,return=minimal")
    owner = a.owner.lower()
    rest("POST", "app_users", "on_conflict=email", [{"email": owner}], "resolution=ignore-duplicates,return=minimal")
    rest("POST", "matter_members", "on_conflict=matter_id,email", [{"matter_id": mid, "email": owner}],
         "resolution=ignore-duplicates,return=minimal")
    for name, role in people(case):
        rpc("add_matter_person", {"m": mid, "person": name, "person_role": role})

    stats = {"docs": 0, "pages": 0, "chunks": 0, "page_level": 0, "section_level": 0}
    for sort, doc in enumerate(REG["docs"]):
        if a.only and doc["id"] not in a.only:
            continue
        tpath = TR / doc["id"] / "FULL-TRANSCRIPT.md"
        transcript = tpath.read_text(encoding="utf-8") if tpath.exists() else ""
        texts, src = page_texts(doc, transcript)
        body_len = len(transcript.split("<!-- SECTION", 1)[-1])
        page_chars = sum(len(t or "") for t in texts)

        # Page-exact chunks from the page text. When that text is much thinner than the
        # displayed transcript (e.g. Firecrawl tables), also index the transcript by its
        # section page ranges, so nothing is lost and each pin states its real precision.
        units = [(i, i, t) for i, t in enumerate(texts, 1) if t and not ILLEGIBLE_ONLY.match(t)]
        stats["page_level"] += bool(units)
        if page_chars < 0.5 * body_len and SECTION_MARK.search(transcript):
            units += split_marked(transcript, SECTION_MARK)
            stats["section_level"] += 1
        chunks = corpus.chunk_units(units)

        corpus.write_document({
            "id": doc["id"], "matter_id": mid, "stage": doc["bundle"], "kind": doc.get("kind"),
            "title": doc["title"], "filename": doc["file"], "source_path": doc.get("source"),
            "page_count": doc["pages"], "bytes": doc.get("bytes"), "sha256": doc["sha256"],
            "pdf_path": f"downloads/{doc['file']}",
            "transcript_path": f"transcripts/{doc['id']}/FULL-TRANSCRIPT.md",
            "ocr_source": doc.get("transcriptSource"), "sections": doc.get("sections", []),
            "transcript": transcript, "sort": sort,
        }, [{
            "doc_id": doc["id"], "page_no": i, "jpeg_path": f"pages/{doc['id']}/page-{i:03d}.jpg",
            "text": t, "text_source": src if t else None,
        } for i, t in enumerate(texts, 1)], chunks)
        stats["docs"] += 1
        stats["pages"] += len(texts)
        stats["chunks"] += len(chunks)
        print(f"{sort + 1:>3}/{len(REG['docs'])} {doc['id'][:60]:<60} {src:<15} chunks={len(chunks)}", flush=True)
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
