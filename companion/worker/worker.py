#!/usr/bin/env python3
"""Upload worker: turns an advocate's uploaded PDF (an `ingest_jobs` row) into a filed,
readable, searchable document. Same pipeline rules as the archive: one PDF = one
document; page scans rasterised; per-page density pick between the PDF text layer and
Google Vision OCR; [ILLEGIBLE] for pages with nothing - never guessed text.

  python3 worker/worker.py          # poll forever
  python3 worker/worker.py --once   # drain the queue and exit

ponytail: runs on the owner's machine (needs pdftotext, PyMuPDF, gcloud ADC). Move to a
container (Railway) when uploads need to process with the laptop closed.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import corpus
from corpus import ARCHIVE_ROOT, rest

sys.path.insert(0, str(ARCHIVE_ROOT / "scripts"))
from assemble import page_transcript, pdftotext_pages, slug_tokens, split_sections  # noqa: E402

# Same scan size/quality as scripts/rasterize.py, via poppler (already required for
# pdftotext) instead of PyMuPDF, so the worker has no native-wheel/arch dependency.
LONG_EDGE, QUALITY = 1700, 80
THIN = 200  # chars; below this a page is treated as a scan and sent to Vision OCR
PAGE_MARK = re.compile(r"(?m)^## Page (\d+) of \d+\s*$")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


TOKEN_TTL = 45 * 60  # gcloud ADC access tokens expire after ~60 min


def vision():
    """Google Vision page OCR via gcloud ADC, or None when unavailable. Refreshes the
    token before it expires and once more on failure; a page that still can't be OCR'd
    fails the job (RuntimeError) rather than being filed as a silent [ILLEGIBLE]."""
    try:
        import google_vision_ocr as gv
        gv.load_env_google()
        tok = {"v": gv.access_token(), "at": time.time()}
    except (Exception, SystemExit) as e:  # noqa: BLE001
        print(f"vision OCR unavailable ({e}); thin pages keep their text layer", file=sys.stderr)
        return None

    def ocr(jpg):
        for attempt in range(2):
            if attempt or time.time() - tok["at"] > TOKEN_TTL:
                tok.update(v=gv.access_token(), at=time.time())
            try:
                return gv.vision_page(tok["v"], jpg)
            except (Exception, SystemExit) as e:  # noqa: BLE001  gv exits the process on HTTP errors
                err = e
        raise RuntimeError(f"Google Vision OCR failed: {str(err)[:300]}")
    return ocr


def section_pages(body: str, start: int) -> int:
    """Page number in force at character offset `start` of a page-keyed transcript."""
    page = 1
    for m in PAGE_MARK.finditer(body):
        if m.start() > start:
            break
        page = int(m.group(1))
    return page


def sectioned(title: str, texts: list[str]) -> tuple[str, list[dict]]:
    """Page-keyed transcript ("## Page i of n"; [ILLEGIBLE: ...] for empty pages) plus
    sections whose page ranges come from the real page markers. split_sections alone
    estimates them by character share."""
    n = len(texts)
    body = page_transcript(texts, n)
    sections = split_sections(title, body, n)
    for s in sections:
        at = body.find(s["body"][:200]) if s.get("body") else 0
        s["pageStart"] = section_pages(body, max(at, 0))
        s.pop("body", None)
    for a, b in zip(sections, sections[1:] + [None]):
        a["pageEnd"] = max(a["pageStart"], (b["pageStart"] - 1) if b else n)
        a["pages"] = f"{a['pageStart']}-{a['pageEnd']}" if a["pageEnd"] != a["pageStart"] else str(a["pageStart"])
    return body, sections


def page_count(pdf: Path) -> int:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"(?m)^Pages:\s+(\d+)", out).group(1))


def rasterize(pdf: Path, i: int, dest: Path) -> Path:
    stem = dest / f"page-{i:03d}"
    subprocess.run(["pdftoppm", "-jpeg", "-jpegopt", f"quality={QUALITY}", "-scale-to", str(LONG_EDGE),
                    "-f", str(i), "-l", str(i), "-singlefile", str(pdf), str(stem)], check=True, capture_output=True)
    return stem.with_suffix(".jpg")


def process(job: dict, ocr) -> str:
    mid = job["matter_id"]
    pdf = corpus.storage_get(job["storage_path"])
    sha = hashlib.sha256(pdf).hexdigest()
    dup = rest("GET", "documents", f"select=id&matter_id=eq.{urllib.parse.quote(mid)}&sha256=eq.{sha}", prefer="")
    if dup:
        return dup[0]["id"]  # same bytes already filed in this matter

    doc_id = f"{slug_tokens(job['title'])[:60].strip('-')}-{sha[:8]}"
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "in.pdf"
        pdf_path.write_bytes(pdf)
        n = page_count(pdf_path)
        rest("PATCH", "ingest_jobs", f"id=eq.{job['id']}", {"page_count": n, "updated_at": now()})

        layer = pdftotext_pages(pdf_path, n)
        texts: list[str] = []
        sources: list[str | None] = []
        for i in range(1, n + 1):
            jpg = rasterize(pdf_path, i, Path(tmp))
            corpus.storage_put(f"{mid}/pages/{doc_id}/page-{i:03d}.jpg", jpg.read_bytes(), "image/jpeg")

            text, src = layer[i - 1], "pdftotext"
            if len(text) < THIN and ocr:
                v = ocr(jpg).strip()
                if len(v) > len(text):  # density pick, per page
                    text, src = v, "google-vision"
            texts.append(text)
            sources.append(src if text else None)
            if i % 5 == 0 or i == n:
                rest("PATCH", "ingest_jobs", f"id=eq.{job['id']}", {"pages_done": i, "updated_at": now()})

    body, sections = sectioned(job["title"], texts)

    used = {s for s in sources if s}
    corpus.write_document({
        "id": doc_id, "matter_id": mid, "stage": job["stage"], "title": job["title"],
        "filename": job["filename"], "source_path": job["filename"], "page_count": n,
        "bytes": len(pdf), "sha256": sha, "pdf_path": job["storage_path"],
        "ocr_source": used.pop() if len(used) == 1 else ("mixed" if used else "none"),
        "sections": sections, "transcript": body,
        "sort": int(time.time()),
    }, [{
        "doc_id": doc_id, "page_no": i, "jpeg_path": f"{mid}/pages/{doc_id}/page-{i:03d}.jpg",
        "text": t or None, "text_source": sources[i - 1],
    } for i, t in enumerate(texts, 1)], corpus.chunk_units([(i, i, t) for i, t in enumerate(texts, 1) if t]))
    return doc_id


def claim() -> dict | None:
    q = rest("GET", "ingest_jobs", "select=id&status=eq.queued&order=created_at&limit=1", prefer="")
    if not q:
        return None
    got = rest("PATCH", "ingest_jobs", f"id=eq.{q[0]['id']}&status=eq.queued",
               {"status": "processing", "updated_at": now()}, "return=representation")
    return got[0] if got else None  # lost the race to another worker: fine


def main() -> None:
    once = "--once" in sys.argv
    # ponytail: assumes a single worker. A job left 'processing' means a previous run died
    # mid-job, so put it back in the queue. Use a lease/heartbeat if workers ever run in parallel.
    stale = rest("PATCH", "ingest_jobs", "status=eq.processing", {"status": "queued", "updated_at": now()}, "return=representation")
    if stale:
        print(f"requeued {len(stale)} job(s) interrupted by a previous run", flush=True)
    ocr = vision()
    while True:
        job = claim()
        if not job:
            if once:
                return
            time.sleep(10)
            continue
        print(f"job {job['id']} {job['filename']}", flush=True)
        try:
            doc_id = process(job, ocr)
            rest("PATCH", "ingest_jobs", f"id=eq.{job['id']}", {"status": "done", "doc_id": doc_id, "error": None, "updated_at": now()})
            print(f"  -> {doc_id}", flush=True)
        except (Exception, SystemExit) as e:  # noqa: BLE001  job-level failure is recorded, worker keeps going
            traceback.print_exc()
            rest("PATCH", "ingest_jobs", f"id=eq.{job['id']}", {"status": "failed", "error": str(e)[:1000], "updated_at": now()})


if __name__ == "__main__":
    main()
