#!/usr/bin/env python3
"""Upload pages, PDFs, and ZIPs to public Supabase Storage bucket `archive`."""
from __future__ import annotations

import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import certifi
import httpx

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BUCKET = "archive"
URL = os.environ.get("SUPABASE_URL", "https://mnsmfobozohejvnmnalw.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ACCESS_TOKEN")


def walk(kind: str = "all") -> list[tuple[str, Path, str]]:
    items: list[tuple[str, Path, str]] = []
    if kind in ("all", "pages"):
        for p in (PUBLIC / "pages").rglob("page-*.jpg"):
            items.append((p.relative_to(PUBLIC).as_posix(), p, "image/jpeg"))
    if kind in ("all", "pdfs", "binaries"):
        for p in (PUBLIC / "downloads").glob("*.pdf"):
            items.append((f"downloads/{p.name}", p, "application/pdf"))
    if kind in ("all", "zips", "binaries"):
        for p in (PUBLIC / "downloads").glob("*-transcripts.zip"):
            items.append((f"downloads/{p.name}", p, "application/zip"))
    return items


def main() -> int:
    if not KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY and retry.", file=sys.stderr)
        return 2
    kind = sys.argv[1] if len(sys.argv) > 1 else "all"
    items = walk(kind)
    print(f"uploading kind={kind} count={len(items)} to {URL}/storage/v1/object/{BUCKET}/", flush=True)
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "x-upsert": "true"}
    ok = err = 0
    with httpx.Client(timeout=120.0, verify=certifi.where(), headers=headers) as client:
        def put(item: tuple[str, Path, str]) -> str:
            rel, path, ctype = item
            guessed = mimetypes.guess_type(path.name)[0] or ctype
            r = client.post(
                f"{URL}/storage/v1/object/{BUCKET}/{rel}",
                content=path.read_bytes(),
                headers={"Content-Type": guessed, "x-upsert": "true"},
            )
            if r.status_code in (200, 201):
                return f"ok {rel}"
            return f"err {r.status_code} {rel} {r.text[:180]}"

        with ThreadPoolExecutor(max_workers=8) as ex:
            futs = [ex.submit(put, item) for item in items]
            n = 0
            for fut in as_completed(futs):
                msg = fut.result()
                n += 1
                if msg.startswith("ok"):
                    ok += 1
                else:
                    err += 1
                    print(msg, flush=True)
                if n % 100 == 0 or n == len(items):
                    print(f"{n}/{len(items)} ok={ok} err={err}", flush=True)
    print(f"done ok={ok} err={err}")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
