#!/usr/bin/env python3
"""File a compiled court volume as its separate papers. Court compilations (a writ
petition with its exhibits, an appeal with the proceedings below) arrive as one
800-page PDF; the advocate needs "Exhibit D, p. 3", not "page 312 of volume 1".

Input is a manifest: the matter, and per volume the parts as the volume's own index
lists them, mapped to PDF page ranges (checked against the stamped page numbers).
Page text comes from the ocr_volume.py cache, so nothing is OCR'd twice. Each part
becomes one document: its own PDF slice, page scans renumbered from 1, verbatim page
text, sections, chunks. `source_path` keeps the volume name and original page range.

  python3 worker/split_volume.py manifest.json            # create matter + file parts
  python3 worker/split_volume.py manifest.json --check    # validate ranges only
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import corpus
from corpus import rest
from worker import page_count, sectioned
from assemble import slug_tokens

MEMBERS = ["omkar1sonawane@gmail.com", "aryap1116@gmail.com", "patilarya.6998@gmail.com"]


def ranges(part: dict) -> list[list[int]]:
    """[[from, to], ...]. Usually one range; several when a paper is interrupted, e.g. by
    a volume's back cover and the next volume's index bound into the same PDF."""
    return part.get("ranges") or [[part["from"], part["to"]]]


def check(volumes: list[dict]) -> None:
    """Parts must tile each volume: every PDF page in exactly one part."""
    for v in volumes:
        n = page_count(Path(v["pdf"]))
        seen = [i for p in v["parts"] for a, b in ranges(p) for i in range(a, b + 1)]
        assert sorted(seen) == list(range(1, n + 1)), \
            f"{v['pdf']}: pages missing {sorted(set(range(1, n + 1)) - set(seen))[:10]}, repeated {sorted({i for i in seen if seen.count(i) > 1})[:10]}"


def slice_pdf(pdf: Path, pages: list[int], tmp: Path) -> bytes:
    for a, b in ((pages[0], pages[-1]),) if pages == list(range(pages[0], pages[-1] + 1)) else ((i, i) for i in pages):
        subprocess.run(["pdfseparate", "-f", str(a), "-l", str(b), str(pdf), str(tmp / "p-%d.pdf")], check=True)
    out = tmp / "part.pdf"
    subprocess.run(["pdfunite", *[str(tmp / f"p-{i}.pdf") for i in pages], str(out)], check=True)
    return out.read_bytes()


def file_part(mid: str, stages: set, vol: dict, part: dict, sort: int,
              filename: str | None = None, sources: list | None = None) -> str:
    """One paper from a volume: its PDF slice, page scans renumbered from 1, verbatim page text.
    `vol` = {pdf, cache}: the cache holds page-NNN.jpg/.txt per PDF page. `sources` (per PDF
    page, 1-based list) records pdftotext vs google-vision; manifests default to Vision."""
    assert part["stage"] in stages, f"unknown stage {part['stage']}"
    pdf, cache = Path(vol["pdf"]), Path(vol["cache"])
    filename = filename or pdf.name
    rng = [i for a, b in ranges(part) for i in range(a, b + 1)]
    with tempfile.TemporaryDirectory() as tmp:
        data = slice_pdf(pdf, rng, Path(tmp))
    sha = hashlib.sha256(data).hexdigest()
    doc_id = f"{slug_tokens(part['title'])[:60].strip('-')}-{sha[:8]}"
    pdf_path: str | None = f"{mid}/pdfs/{doc_id}.pdf"
    try:
        corpus.storage_put(pdf_path, data, "application/pdf")
    except RuntimeError as e:  # a single paper over the 50 MB storage cap: text and scans still filed
        print(f"  PDF not stored for {part['title']}: {e}", flush=True)
        pdf_path = None

    texts = []
    for k, i in enumerate(rng, 1):
        corpus.storage_put(f"{mid}/pages/{doc_id}/page-{k:03d}.jpg", (cache / f"page-{i:03d}.jpg").read_bytes(), "image/jpeg")
        texts.append((cache / f"page-{i:03d}.txt").read_text().strip())
    body, sections = sectioned(part["title"], texts)
    span = ", ".join(f"pp. {a}-{b}" if b > a else f"p. {a}" for a, b in ranges(part))
    src = [(sources[i - 1] if sources else "google-vision") for i in rng]
    used = {x for x, t in zip(src, texts) if t}
    corpus.write_document({
        "id": doc_id, "matter_id": mid, "stage": part["stage"], "title": part["title"],
        "filename": filename, "source_path": f"{filename}, {span}", "page_count": len(texts),
        "bytes": len(data), "sha256": sha, "pdf_path": pdf_path,
        "ocr_source": used.pop() if len(used) == 1 else ("mixed" if used else "none"),
        "sections": sections, "transcript": body, "sort": sort,
    }, [{
        "doc_id": doc_id, "page_no": k, "jpeg_path": f"{mid}/pages/{doc_id}/page-{k:03d}.jpg",
        "text": t or None, "text_source": x if t else None,
    } for k, (t, x) in enumerate(zip(texts, src), 1)], corpus.chunk_units([(k, k, t) for k, t in enumerate(texts, 1) if t]))
    return doc_id


def main() -> None:
    man = json.loads(Path(sys.argv[1]).read_text())
    check(man["volumes"])
    if "--check" in sys.argv:
        print("ranges ok")
        return
    m = man["matter"]
    rest("POST", "matters", "on_conflict=id", [{k: m[k] for k in
         ("id", "title", "short", "kind", "forum", "cause", "posture", "stages", "disclaimer") if k in m}],
         "resolution=merge-duplicates,return=minimal")
    rest("POST", "matter_members", "on_conflict=matter_id,email", [{"matter_id": m["id"], "email": e} for e in MEMBERS],
         "resolution=ignore-duplicates,return=minimal")
    for p in m.get("people", []):
        corpus.rpc("add_matter_person", {"m": m["id"], "person": p["name"], "person_role": p["role"]})
    stages = {s["id"] for s in m["stages"]}
    sort = 0
    for vol in man["volumes"]:
        for part in vol["parts"]:
            sort += 1
            print(f"{m['id']}: {part['title']} {ranges(part)}", flush=True)
            file_part(m["id"], stages, vol, part, sort)


if __name__ == "__main__":
    main()
