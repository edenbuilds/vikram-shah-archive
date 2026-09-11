#!/usr/bin/env python3
"""Page-level OCR via Apple Vision for pages without extractable PDF text."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = json.loads((ROOT / "data" / "archive.json").read_text())
PAGES = ROOT / "public" / "pages"
OCR_DIR = ROOT / "work" / "ocr"
SWIFT = ROOT / "scripts" / "ocr_pages.swift"
BIN = ROOT / "work" / "ocr_pages"


def compile_ocr() -> None:
    BIN.parent.mkdir(parents=True, exist_ok=True)
    if BIN.exists():
        return
    r = subprocess.run(
        ["swiftc", "-O", "-o", str(BIN), str(SWIFT), "-framework", "Vision", "-framework", "AppKit"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        raise SystemExit(r.stderr or r.stdout)


def ocr_batch(paths: list[Path]) -> dict[str, str]:
    r = subprocess.run([str(BIN), *[str(p) for p in paths]], capture_output=True, text=True)
    out: dict[str, str] = {}
    current = None
    buf: list[str] = []
    for line in (r.stdout or "").splitlines():
        if line.startswith("-----FILE:") and line.endswith("-----"):
            if current is not None:
                out[current] = "\n".join(buf).strip()
            current = line[len("-----FILE:") : -5]
            buf = []
        else:
            buf.append(line)
    if current is not None:
        out[current] = "\n".join(buf).strip()
    return out


def main() -> int:
    compile_ocr()
    OCR_DIR.mkdir(parents=True, exist_ok=True)
    batch: list[Path] = []
    total = 0
    for doc in ARCHIVE["docs"]:
        dest_dir = OCR_DIR / doc["id"]
        dest_dir.mkdir(parents=True, exist_ok=True)
        for i in range(1, doc["pages"] + 1):
            jpg = PAGES / doc["id"] / f"page-{i:03d}.jpg"
            md = dest_dir / f"page-{i:03d}.txt"
            if md.exists() and md.stat().st_size > 0:
                continue
            if not jpg.exists():
                continue
            batch.append(jpg)
            if len(batch) >= 8:
                result = ocr_batch(batch)
                for p in batch:
                    text = result.get(str(p), result.get(p.as_posix(), ""))
                    out = OCR_DIR / p.parent.name / (p.stem + ".txt")
                    out.write_text(text + "\n", encoding="utf-8")
                    total += 1
                print(f"ocr {total} pages", flush=True)
                batch = []
    if batch:
        result = ocr_batch(batch)
        for p in batch:
            text = result.get(str(p), result.get(p.as_posix(), ""))
            out = OCR_DIR / p.parent.name / (p.stem + ".txt")
            out.write_text(text + "\n", encoding="utf-8")
            total += 1
        print(f"ocr {total} pages", flush=True)
    print("ocr done", total, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
