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
from concurrent.futures import ThreadPoolExecutor
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
import notify  # noqa: E402
import volume_index  # noqa: E402

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


STORE_MAX = 48 * 1024 * 1024  # storage refuses objects over 50 MB on this plan


def fetch_upload(path: str) -> bytes:
    """The uploaded file, rejoined when the browser sent it in 45 MB pieces (<path>.partNNN)."""
    try:
        return corpus.storage_get(path)
    except RuntimeError as whole:
        parts, k = [], 0
        while True:
            try:
                parts.append(corpus.storage_get(f"{path}.part{k:03d}"))
            except RuntimeError:
                break
            k += 1
        if not parts:
            raise whole
        return b"".join(parts)


def as_pdf(data: bytes, tmp: Path, filename: str) -> bytes:
    """PDFs as they are; photos of pages (JPG, PNG, HEIC, TIFF) converted with macOS sips."""
    if data[:5] == b"%PDF-":
        return data
    ext = Path(filename).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".heic", ".tif", ".tiff"}:
        src, out = tmp / f"in{ext}", tmp / "converted.pdf"
        src.write_bytes(data)
        subprocess.run(["sips", "-s", "format", "pdf", str(src), "--out", str(out)], check=True, capture_output=True)
        return out.read_bytes()
    raise RuntimeError(f"Can't read {ext or 'this'} files yet. Save it as a PDF and upload that.")


def process(job: dict, ocr) -> str:
    mid = job["matter_id"]
    original = fetch_upload(job["storage_path"])
    sha = hashlib.sha256(original).hexdigest()
    dup = rest("GET", "documents", f"select=id&matter_id=eq.{urllib.parse.quote(mid)}&sha256=eq.{sha}", prefer="")
    if dup:
        return dup[0]["id"]  # same bytes already filed in this matter

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        pdf = as_pdf(original, tmp, job["filename"])
        pdf_path = tmp / "in.pdf"
        pdf_path.write_bytes(pdf)
        n = page_count(pdf_path)
        rest("PATCH", "ingest_jobs", f"id=eq.{job['id']}", {"page_count": n, "updated_at": now()})

        layer = pdftotext_pages(pdf_path, n)

        def read(i: int) -> tuple[str, str | None]:
            jpg = rasterize(pdf_path, i, tmp)  # tmp/page-NNN.jpg, kept until filed
            text, src = layer[i - 1], "pdftotext"
            if len(text) < THIN and ocr:
                v = ocr(jpg).strip()
                if len(v) > len(text):  # density pick, per page
                    text, src = v, "google-vision"
            (tmp / f"page-{i:03d}.txt").write_text(text)
            return text, (src if text else None)

        texts: list[str] = []
        sources: list[str | None] = []
        # 6 pages at a time: an 800-page volume took ~35 min one page at a time
        with ThreadPoolExecutor(6) as pool:
            for i, (text, src) in enumerate(pool.map(read, range(1, n + 1)), 1):
                texts.append(text)
                sources.append(src)
                if i % 10 == 0 or i == n:
                    rest("PATCH", "ingest_jobs", f"id=eq.{job['id']}", {"pages_done": i, "updated_at": now()})

        # A compiled volume (petition + exhibits, appeal + proceedings below) is filed as its
        # separate papers, named by the volume's own index. Anything doubtful: one paper, as before.
        try:
            parts = volume_index.split_nested(texts, [tmp / f"page-{i:03d}.jpg" for i in range(1, n + 1)])
        except Exception as e:  # noqa: BLE001
            print(f"  index split skipped: {e}", file=sys.stderr, flush=True)
            parts = None
        if parts and len(parts) > 2:
            import split_volume  # late: split_volume imports this module
            stages = rest("GET", "matters", f"select=stages&id=eq.{urllib.parse.quote(mid)}", prefer="")[0]["stages"]
            # papers found inside an exhibit (its own index) sit in that exhibit's stage
            for p, st in zip(parts, volume_index.assign_stages([p.get("parent") or p["title"] for p in parts], stages, job["stage"])):
                p["stage"] = st
            base, ids = int(time.time()), []
            for k, p in enumerate(parts):
                ids.append(split_volume.file_part(mid, {s["id"] for s in stages}, {"pdf": pdf_path, "cache": tmp}, p,
                                                  base + k, filename=job["filename"], sources=sources))
            print(f"  split by index into {len(ids)} papers", flush=True)
            return ids[0]

        if len(pdf) > STORE_MAX:
            # no index to split by, and too big to store as one object: file it in page ranges
            import split_volume  # late: split_volume imports this module
            k = -(-len(pdf) // STORE_MAX) + 1
            step = -(-n // k)
            stages = {s["id"] for s in rest("GET", "matters", f"select=stages&id=eq.{urllib.parse.quote(mid)}", prefer="")[0]["stages"]}
            ids = [split_volume.file_part(mid, stages, {"pdf": pdf_path, "cache": tmp},
                                          {"title": f"{job['title']} (part {j + 1} of {k}, pp. {a}-{min(a + step - 1, n)})", "stage": job["stage"],
                                           "from": a, "to": min(a + step - 1, n)}, int(time.time()) + j, filename=job["filename"], sources=sources)
                   for j, a in enumerate(range(1, n + 1, step))]
            return ids[0]

        doc_id = f"{slug_tokens(job['title'])[:60].strip('-')}-{sha[:8]}"
        pdf_store = job["storage_path"]
        if pdf is not original or len(original) > 45 * 1024 * 1024:
            pdf_store = f"{mid}/pdfs/{doc_id}.pdf"  # converted or rejoined: store the PDF itself
            corpus.storage_put(pdf_store, pdf, "application/pdf")
        for i in range(1, n + 1):
            corpus.storage_put(f"{mid}/pages/{doc_id}/page-{i:03d}.jpg", (tmp / f"page-{i:03d}.jpg").read_bytes(), "image/jpeg")

    body, sections = sectioned(job["title"], texts)

    used = {s for s in sources if s}
    corpus.write_document({
        "id": doc_id, "matter_id": mid, "stage": job["stage"], "title": job["title"],
        "filename": job["filename"], "source_path": job["filename"], "page_count": n,
        "bytes": len(pdf), "sha256": sha, "pdf_path": pdf_store,
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
    while True:
        try:
            stale = rest("PATCH", "ingest_jobs", "status=eq.processing", {"status": "queued", "updated_at": now()}, "return=representation")
            break
        except OSError as e:
            print(f"queue unreachable ({e}); retrying in 60s", file=sys.stderr, flush=True)
            time.sleep(60)
    if stale:
        print(f"requeued {len(stale)} job(s) interrupted by a previous run", flush=True)
    ocr = vision()
    while True:
        try:
            job = claim()
        except OSError as e:  # URLError included. 2026-09-21: an offline Mac crash-looped the LaunchAgent into a 56k-line log
            print(f"queue unreachable ({e}); retrying in 60s", file=sys.stderr, flush=True)
            time.sleep(60)
            continue
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
            notify.job_done({**job, "doc_id": doc_id})
        except (Exception, SystemExit) as e:  # noqa: BLE001  job-level failure is recorded, worker keeps going
            traceback.print_exc()
            rest("PATCH", "ingest_jobs", f"id=eq.{job['id']}", {"status": "failed", "error": str(e)[:1000], "updated_at": now()})
            notify.job_failed(job, str(e))


if __name__ == "__main__":
    main()
