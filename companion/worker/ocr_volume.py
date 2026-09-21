#!/usr/bin/env python3
"""OCR a compiled court volume once, page by page, into a local cache
(<out>/page-NNN.jpg + page-NNN.txt), so it can be split into its constituent papers
(split_volume.py) without re-paying Google Vision. Resumable: cached pages are skipped.

  python3 worker/ocr_volume.py <pdf> <out_dir> [threads]
"""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import worker
from assemble import pdftotext_pages

pdf, out = Path(sys.argv[1]), Path(sys.argv[2])
threads = int(sys.argv[3]) if len(sys.argv) > 3 else 8
out.mkdir(parents=True, exist_ok=True)
n = worker.page_count(pdf)
layer = pdftotext_pages(pdf, n)
ocr = worker.vision()


def one(i: int) -> None:
    txt = out / f"page-{i:03d}.txt"
    if txt.exists():
        return
    jpg = worker.rasterize(pdf, i, out)
    text = layer[i - 1]
    if len(text) < worker.THIN and ocr:
        v = ocr(jpg).strip()
        text = v if len(v) > len(text) else text
    txt.write_text(text)


with ThreadPoolExecutor(threads) as ex:
    for k, _ in enumerate(ex.map(one, range(1, n + 1)), 1):
        if k % 50 == 0 or k == n:
            print(f"{pdf.name}: {k}/{n}", flush=True)
