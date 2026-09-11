#!/usr/bin/env python3
"""Downscale page JPEGs so a Hobby deploy can carry the scans."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "pages"
MAX = 1400
QUALITY = 62


def main() -> None:
    n = 0
    saved = 0
    for p in ROOT.rglob("page-*.jpg"):
        before = p.stat().st_size
        im = Image.open(p)
        im = im.convert("RGB")
        w, h = im.size
        long = max(w, h)
        if long > MAX:
            scale = MAX / long
            im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        im.save(p, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        after = p.stat().st_size
        saved += before - after
        n += 1
        if n % 200 == 0:
            print(f"{n} pages, saved {saved/1024/1024:.1f} MB", flush=True)
    print(f"done {n} pages, saved {saved/1024/1024:.1f} MB")


if __name__ == "__main__":
    main()
