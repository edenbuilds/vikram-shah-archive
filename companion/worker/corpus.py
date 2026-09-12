"""Shared corpus writer for the companion: page text -> paragraph chunks -> embeddings
-> Supabase (service role). Used by load_archive.py (existing archive matter) and
worker.py (advocate uploads). Never edits source text: chunks are verbatim slices."""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
COMPANION = HERE.parent
ARCHIVE_ROOT = COMPANION.parent


def load_env() -> None:
    env = COMPANION / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
EMBED_MODEL = "text-embedding-3-small"
BUCKET = "companion"


def _req(method: str, url: str, body: bytes | None, headers: dict, timeout: int = 120):
    for attempt in range(4):
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                return json.loads(raw) if raw and "json" in (r.headers.get("Content-Type") or "") else raw
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:800]
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"{method} {url.split('?')[0]} -> {e.code}: {msg}") from None


def _auth() -> dict:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def rest(method: str, table: str, query: str = "", rows=None, prefer: str = "return=minimal"):
    url = f"{SUPABASE_URL}/rest/v1/{table}{'?' + query if query else ''}"
    body = json.dumps(rows).encode() if rows is not None else None
    return _req(method, url, body, {**_auth(), "Content-Type": "application/json", "Prefer": prefer})


def rpc(fn: str, args: dict):
    return _req("POST", f"{SUPABASE_URL}/rest/v1/rpc/{fn}", json.dumps(args).encode(),
                {**_auth(), "Content-Type": "application/json"})


def storage_put(path: str, data: bytes, content_type: str) -> None:
    _req("POST", f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}", data,
         {**_auth(), "Content-Type": content_type, "x-upsert": "true"}, timeout=300)


def storage_get(path: str) -> bytes:
    return _req("GET", f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}", None, _auth(), timeout=300)


# ── Chunking ────────────────────────────────────────────────────────────────

NOISE = re.compile(r"^(## Page \d+( of \d+)?|---|<!-- SECTION.*-->)\s*$")
TARGET, MAX = 900, 1600


def paragraphs(text: str) -> list[str]:
    lines = [ln for ln in text.splitlines() if not NOISE.match(ln.strip())]
    paras = [p.strip() for p in re.split(r"\n\s*\n", "\n".join(lines))]
    return [p for p in paras if p]


def chunk_text(text: str) -> list[str]:
    """Greedy-merge paragraphs to ~TARGET chars; hard-split any paragraph over MAX on line
    boundaries. Output pieces are verbatim substrings (modulo the joining blank line)."""
    out: list[str] = []
    buf = ""
    for p in paragraphs(text):
        pieces = [p]
        if len(p) > MAX:
            pieces, cur = [], ""
            for ln in p.splitlines():
                if cur and len(cur) + len(ln) > MAX:
                    pieces.append(cur)
                    cur = ""
                cur = f"{cur}\n{ln}" if cur else ln
            if cur:
                pieces.append(cur)
        for piece in pieces:
            if buf and len(buf) + len(piece) > TARGET:
                out.append(buf)
                buf = ""
            buf = f"{buf}\n\n{piece}" if buf else piece
    if buf:
        out.append(buf)
    return out


def chunk_units(units: list[tuple[int, int, str]]) -> list[dict]:
    """units: (page_start, page_end, text) -> chunk rows (without matter/doc ids)."""
    rows, ord_ = [], 0
    for ps, pe, text in units:
        for piece in chunk_text(text or ""):
            if len(piece.strip()) < 20:
                continue
            rows.append({"page_start": ps, "page_end": pe, "ord": ord_, "text": piece})
            ord_ += 1
    return rows


# ── Embeddings ──────────────────────────────────────────────────────────────

def embed(texts: list[str]) -> list[list[float]]:
    if not OPENAI_KEY:
        raise SystemExit("OPENAI_API_KEY missing in companion/.env.local")
    out: list[list[float]] = []
    for i in range(0, len(texts), 96):
        batch = [t[:8000] for t in texts[i:i + 96]]
        data = _req("POST", "https://api.openai.com/v1/embeddings",
                    json.dumps({"model": EMBED_MODEL, "input": batch}).encode(),
                    {"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"})
        out.extend(d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"]))
    return out


# ── Write one document (idempotent per doc id) ──────────────────────────────

def write_document(doc: dict, pages: list[dict], chunks: list[dict]) -> None:
    rest("POST", "documents", "on_conflict=id", [doc], "resolution=merge-duplicates,return=minimal")
    did = urllib.parse.quote(doc["id"])
    rest("DELETE", "document_pages", f"doc_id=eq.{did}")
    rest("DELETE", "chunks", f"doc_id=eq.{did}")
    for i in range(0, len(pages), 200):
        rest("POST", "document_pages", "", pages[i:i + 200])
    if chunks:
        vecs = embed([c["text"] for c in chunks])
        rows = [{**c, "doc_id": doc["id"], "matter_id": doc["matter_id"], "embedding": v} for c, v in zip(chunks, vecs)]
        for i in range(0, len(rows), 100):
            rest("POST", "chunks", "", rows[i:i + 100])


if __name__ == "__main__":
    # ponytail: self-check for the chunker, no framework
    t = "## Page 1 of 2\n\nPara one.\n\n---\n\nPara two is here.\n\n" + ("x" * 50 + "\n") * 40
    cs = chunk_text(t)
    assert all("## Page" not in c and "---" not in c.split("\n") for c in cs), cs
    assert all(len(c) <= MAX + 60 for c in cs), [len(c) for c in cs]
    assert cs[0].startswith("Para one.") and "Para two is here." in cs[0]
    src = "\n".join(ln for ln in t.splitlines() if not NOISE.match(ln.strip()))
    assert all(all(line in src for line in c.splitlines()) for c in cs)
    rows = chunk_units([(3, 3, "A long enough paragraph of text."), (4, 5, "")])
    assert rows == [{"page_start": 3, "page_end": 3, "ord": 0, "text": "A long enough paragraph of text."}]
    print("corpus self-check ok", file=sys.stderr)
