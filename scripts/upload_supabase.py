#!/usr/bin/env python3
"""Upload pages, PDFs, and ZIPs to a public Supabase Storage bucket named `archive`.

Requires:
  SUPABASE_URL              e.g. https://mnsmfobozohejvnmnalw.supabase.co
  SUPABASE_SERVICE_ROLE_KEY service role (server-side only; never ship to the browser)
"""
from __future__ import annotations

import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BUCKET = "archive"
URL = os.environ.get("SUPABASE_URL", "https://mnsmfobozohejvnmnalw.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ACCESS_TOKEN")


def put(path: str, data: bytes, content_type: str) -> str:
    dest = f"{URL}/storage/v1/object/{BUCKET}/{path}"
    req = urllib.request.Request(
        dest,
        data=data,
        method="POST",
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            return f"ok {res.status} {path}"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[-200:]
        return f"err {e.code} {path} {body}"


def walk() -> list[tuple[str, Path, str]]:
    items = []
    for p in (PUBLIC / "pages").rglob("page-*.jpg"):
        rel = p.relative_to(PUBLIC).as_posix()
        items.append((rel, p, "image/jpeg"))
    for p in (PUBLIC / "downloads").glob("*.pdf"):
        items.append((f"downloads/{p.name}", p, "application/pdf"))
    for p in (PUBLIC / "downloads").glob("*.zip"):
        items.append((f"downloads/{p.name}", p, "application/zip"))
    return items


def main() -> int:
    if not KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ACCESS_TOKEN) and retry.", file=sys.stderr)
        return 2
    items = walk()
    print(f"uploading {len(items)} files to {URL}/storage/v1/object/public/{BUCKET}/", flush=True)
    ok = err = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = []
        for rel, path, ctype in items:
            data = path.read_bytes()
            guessed = mimetypes.guess_type(path.name)[0] or ctype
            futs.append(ex.submit(put, rel, data, guessed))
        n = 0
        for fut in as_completed(futs):
            msg = fut.result()
            n += 1
            if msg.startswith("ok"):
                ok += 1
            else:
                err += 1
                print(msg, flush=True)
            if n % 100 == 0:
                print(f"{n}/{len(items)} ok={ok} err={err}", flush=True)
    print(f"done ok={ok} err={err}")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
