#!/usr/bin/env python3
"""Parse every original PDF with Firecrawl into .firecrawl/{id}.md"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = json.loads((ROOT / "data" / "archive.json").read_text())
SRC = ROOT / "public" / "downloads"
OUT = ROOT / ".firecrawl"
OUT.mkdir(exist_ok=True)


def parse_one(doc: dict) -> tuple[str, str]:
    slug = doc["id"]
    dest = OUT / f"{slug}.md"
    if dest.exists() and dest.stat().st_size > 80:
        return slug, "skip"
    pdf = SRC / doc["file"]
    # Large compilations need a long timeout. 1s/page + 120s floor.
    timeout = max(180_000, int(doc["pages"]) * 4000)
    cmd = [
        "firecrawl",
        "parse",
        str(pdf),
        "-o",
        str(dest),
        "--timeout",
        str(timeout),
    ]
    env = os.environ.copy()
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "fail")[-500:]
        return slug, f"err:{err}"
    if not dest.exists() or dest.stat().st_size < 40:
        return slug, "empty"
    return slug, f"ok:{dest.stat().st_size}"


def main() -> int:
    docs = ARCHIVE["docs"]
    # smallest first so the UI has real transcripts quickly
    docs = sorted(docs, key=lambda d: d["pages"])
    workers = 4
    print(f"firecrawl parse {len(docs)} pdfs, workers={workers}", flush=True)
    ok = skip = err = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(parse_one, d) for d in docs]
        n = 0
        for fut in as_completed(futs):
            slug, status = fut.result()
            n += 1
            if status == "skip":
                skip += 1
            elif status.startswith("ok"):
                ok += 1
            else:
                err += 1
            print(f"[{n}/{len(docs)}] {slug} {status}", flush=True)
    print(f"done ok={ok} skip={skip} err={err}", flush=True)
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
