#!/usr/bin/env python3
"""Rasterize every PDF page to JPEG under public/pages/{docSlug}/page-NNN.jpg."""
from __future__ import annotations

import json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = json.loads((ROOT / "data" / "archive.json").read_text())
SRC = ROOT / "public" / "downloads"
OUT = ROOT / "public" / "pages"
LONG_EDGE = 1700
QUALITY = 80


def raster_one(doc_id: str, pages: int) -> tuple[str, int, str]:
    pdf = SRC / f"{doc_id}.pdf"
    dest = OUT / doc_id
    dest.mkdir(parents=True, exist_ok=True)
    done = 0
    if all((dest / f"page-{i:03d}.jpg").exists() for i in range(1, pages + 1)):
        return doc_id, pages, "skip"
    doc = fitz.open(pdf)
    try:
        for i, page in enumerate(doc, start=1):
            out = dest / f"page-{i:03d}.jpg"
            if out.exists() and out.stat().st_size > 2000:
                done += 1
                continue
            rect = page.rect
            long = max(rect.width, rect.height) or 1
            scale = LONG_EDGE / long
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            pix.save(out.as_posix(), jpg_quality=QUALITY)
            done += 1
    finally:
        doc.close()
    return doc_id, done, "ok"


def main() -> int:
    docs = ARCHIVE["docs"]
    workers = 6
    print(f"rasterizing {len(docs)} docs", flush=True)
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(raster_one, d["id"], d["pages"]) for d in docs]
        n = 0
        for fut in as_completed(futs):
            doc_id, done, status = fut.result()
            n += 1
            print(f"[{n}/{len(docs)}] {status} {doc_id} ({done} pages)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
