#!/usr/bin/env python3
"""Re-parse weak / truncated transcripts with Firecrawl and rebuild packs."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = json.loads((ROOT / "data" / "archive.json").read_text())
FC = ROOT / ".firecrawl"
DL = ROOT / "public" / "downloads"
MIN_DENSITY = 350  # chars per page


def density(doc: dict) -> float:
    md = ROOT / "public" / "transcripts" / doc["id"] / "FULL-TRANSCRIPT.md"
    if not md.exists():
        return 0.0
    return md.stat().st_size / max(doc["pages"], 1)


def weak_docs() -> list[dict]:
    out = []
    for d in ARCHIVE["docs"]:
        dens = density(d)
        # large compilations or thin OCR
        if dens < MIN_DENSITY or (d["pages"] >= 20 and dens < 600):
            out.append({**d, "_density": dens})
    return sorted(out, key=lambda d: d["_density"])


def parse_one(doc: dict) -> tuple[str, str]:
    dest = FC / f"{doc['id']}.md"
    pdf = DL / doc["file"]
    timeout = max(300_000, int(doc["pages"]) * 6000)
    # force refresh
    if dest.exists():
        dest.unlink()
    r = subprocess.run(
        ["firecrawl", "parse", str(pdf), "-o", str(dest), "--timeout", str(timeout)],
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )
    if r.returncode != 0:
        return doc["id"], f"err:{(r.stderr or r.stdout or '')[-300:]}"
    if not dest.exists() or dest.stat().st_size < 80:
        return doc["id"], "empty"
    return doc["id"], f"ok:{dest.stat().st_size}"


def main() -> int:
    docs = weak_docs()
    print(f"re-parsing {len(docs)} weak docs", flush=True)
    for d in docs[:20]:
        print(f"  {d['_density']:.0f} c/p  {d['pages']}p  {d['id']}", flush=True)
    ok = err = 0
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = [ex.submit(parse_one, d) for d in docs]
        n = 0
        for fut in as_completed(futs):
            slug, status = fut.result()
            n += 1
            if status.startswith("ok"):
                ok += 1
            else:
                err += 1
            print(f"[{n}/{len(docs)}] {slug} {status}", flush=True)
    print(f"done ok={ok} err={err}", flush=True)
    # rebuild packs from firecrawl
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "assemble.py")], cwd=ROOT)
    return 0 if r.returncode == 0 and err == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
