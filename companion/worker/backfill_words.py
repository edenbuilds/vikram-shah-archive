"""python3 worker/backfill_words.py <doc_id> [...] - word boxes for papers filed before 13-10-2026.

Text-layer pages are read from the stored PDF (free); OCR'd pages go through Google Vision again
(paid per page). Pages typed in by hand (uploaded-ocr) are skipped. Writes <mid>/pages/<doc>/words-NNN.json
beside each scan; the page text in document_pages is left exactly as it is.
"""
import json
import sys
import tempfile
from pathlib import Path

import corpus
from corpus import rest
from worker import layer_words

sys.path.insert(0, str(corpus.ARCHIVE_ROOT / "scripts"))
import google_vision_ocr as gv  # noqa: E402


def backfill(doc: str, token: str) -> None:
    d = rest("GET", "documents", f"id=eq.{doc}&select=matter_id,pdf_path")[0]
    pages = rest("GET", "document_pages", f"doc_id=eq.{doc}&select=page_no,jpeg_path,text_source&order=page_no")
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "p.pdf"
        if any(p["text_source"] == "pdftotext" for p in pages):
            pdf.write_bytes(corpus.storage_get(d["pdf_path"]))
        for p in pages:
            words = None
            if p["text_source"] == "pdftotext":
                words = layer_words(pdf, p["page_no"])
            elif p["text_source"] and p["text_source"] != "uploaded-ocr":
                jpg = Path(tmp) / "p.jpg"
                jpg.write_bytes(corpus.storage_get(p["jpeg_path"]))
                words = []
                gv.vision_page(token, jpg, words)
            if words:
                corpus.storage_put(p["jpeg_path"].replace(".jpg", ".json").replace("/page-", "/words-"),
                                   json.dumps(words).encode(), "application/json")
            print(f"{doc} p{p['page_no']}: {len(words or [])} words", flush=True)


if __name__ == "__main__":
    corpus.load_env()
    gv.load_env_google()
    tok = gv.access_token()
    for a in sys.argv[1:]:
        backfill(a, tok)
