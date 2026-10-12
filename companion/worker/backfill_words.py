"""python3 worker/backfill_words.py [<doc_id> ...]   (no ids: every paper; pages already done are skipped) - word boxes for papers filed before 13-10-2026.

Text-layer pages are read from the stored PDF (free); OCR'd pages go through Google Vision again
(paid per page), as are pages whose text was typed in or came from a transcript (13-10-2026: those had no text
layer, so words on them could not be picked). Writes <mid>/pages/<doc>/words-NNN.json
beside each scan; the page text in document_pages is left exactly as it is.
"""
import json
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import corpus
from corpus import rest
from worker import layer_words

sys.path.insert(0, str(corpus.ARCHIVE_ROOT / "scripts"))
import google_vision_ocr as gv  # noqa: E402


def listed(prefix: str) -> set:
    try:
        r = corpus._req("POST", f"{corpus.SUPABASE_URL}/storage/v1/object/list/companion",
                        json.dumps({"prefix": prefix, "limit": 5000}).encode(), {**corpus._auth(), "Content-Type": "application/json"})
        return {prefix + x["name"] for x in r}
    except Exception:  # noqa: BLE001
        return set()


def backfill(doc: str, token: str) -> None:
    d = rest("GET", "documents", f"id=eq.{doc}&select=matter_id,pdf_path")[0]
    pages = rest("GET", "document_pages", f"doc_id=eq.{doc}&select=page_no,jpeg_path,text_source&order=page_no")
    if not pages:
        return
    done = listed(pages[0]["jpeg_path"].rsplit("/", 1)[0] + "/")
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "p.pdf"
        if d["pdf_path"] and any(p["text_source"] == "pdftotext" for p in pages):
            pdf.write_bytes(corpus.storage_get(d["pdf_path"]))
        def one(p):
            out = p["jpeg_path"].replace(".jpg", ".json").replace("/page-", "/words-")
            if not p["jpeg_path"] or out in done:
                return
            words = None
            if p["text_source"] == "pdftotext":
                words = layer_words(pdf, p["page_no"])
            else:
                jpg = Path(tmp) / f"p{p['page_no']}.jpg"
                jpg.write_bytes(corpus.storage_get(p["jpeg_path"]))
                words = []
                gv.vision_page(token, jpg, words)
            if words:
                corpus.storage_put(out, json.dumps(words).encode(), "application/json")

        def safe(p):
            try:
                one(p)
            except (Exception, SystemExit) as e:  # noqa: BLE001  one bad page never stops the run
                print(f"{doc} p{p['page_no']}: {str(e)[:150]}", flush=True)
        with ThreadPoolExecutor(6) as pool:
            list(pool.map(safe, pages))
        print(f"{doc}: {len(pages)} pages", flush=True)


if __name__ == "__main__":
    corpus.load_env()
    gv.load_env_google()
    tok, at = gv.access_token(), time.time()
    for a in sys.argv[1:] or [x["id"] for x in rest("GET", "documents", "select=id&order=sort.desc")]:
        if time.time() - at > 2400:  # a gcloud token lasts an hour; the whole archive takes longer
            tok, at = gv.access_token(), time.time()
        backfill(a, tok)
