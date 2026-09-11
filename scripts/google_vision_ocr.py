#!/usr/bin/env python3
"""Google Cloud Vision DOCUMENT_TEXT_DETECTION for thin / scan-like pages.

Uses Application Default Credentials (gcloud ADC) + certifi SSL.
Optional GOOGLE_OAUTH_CLIENT_SECRET in .env.google is recorded for ops;
Vision calls authenticate via ADC, not the GOCSPX secret alone.
"""
from __future__ import annotations

import base64
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import certifi

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = json.loads((ROOT / "data" / "archive.json").read_text())
PAGES = ROOT / "public" / "pages"
OUT = ROOT / "work" / "google_ocr"
PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "shb-documents-portal-20260729")
GCLOUD = Path("/Users/omkar/Downloads/google-cloud-sdk/bin/gcloud")


def load_env_google() -> None:
    env = ROOT / ".env.google"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def access_token() -> str:
    r = subprocess.run(
        [str(GCLOUD), "auth", "application-default", "print-access-token"],
        capture_output=True,
        text=True,
    )
    tok = (r.stdout or "").strip()
    if not tok:
        raise SystemExit(r.stderr or "no ADC access token")
    return tok


def vision_page(token: str, jpg: Path) -> str:
    b64 = base64.b64encode(jpg.read_bytes()).decode()
    body = json.dumps(
        {
            "requests": [
                {
                    "image": {"content": b64},
                    "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                }
            ]
        }
    ).encode()
    ctx = ssl.create_default_context(cafile=certifi.where())
    req = urllib.request.Request(
        "https://vision.googleapis.com/v1/images:annotate",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-goog-user-project": os.environ.get("GOOGLE_CLOUD_PROJECT", PROJECT),
        },
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
                data = json.load(resp)
            item = (data.get("responses") or [{}])[0]
            if item.get("error"):
                raise RuntimeError(item["error"])
            return (item.get("fullTextAnnotation") or {}).get("text", "") or ""
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            if e.code in (429, 503, 500) and attempt < 3:
                time.sleep(2 ** attempt)
                token = access_token()
                req = urllib.request.Request(
                    "https://vision.googleapis.com/v1/images:annotate",
                    data=body,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "x-goog-user-project": os.environ.get("GOOGLE_CLOUD_PROJECT", PROJECT),
                    },
                )
                continue
            raise SystemExit(f"Vision HTTP {e.code}: {raw[:500]}") from e
    return ""


def thin_doc_ids() -> list[str]:
    """Docs with continuous/thin transcripts that benefit from page Vision."""
    ids = []
    for d in ARCHIVE["docs"]:
        p = ROOT / "public" / "downloads" / f"{d['id']}-FULL-TRANSCRIPT.md"
        if not p.exists():
            ids.append(d["id"])
            continue
        t = p.read_text(encoding="utf-8", errors="replace")
        markers = len(re.findall(r"(?m)^## Page \d+", t))
        i = t.find("<!-- SECTION")
        body = t[i:] if i >= 0 else t
        cpp = len(body) / max(d["pages"], 1)
        # Prefer Vision when no page markers and density is thin, or 1–2p short leaves.
        if markers == 0 and cpp < 900:
            ids.append(d["id"])
        elif markers == 0 and d["pages"] <= 2 and cpp < 1200:
            ids.append(d["id"])
    return ids


def main() -> int:
    load_env_google()
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else set(thin_doc_ids())
    docs = [d for d in ARCHIVE["docs"] if d["id"] in only]
    print(f"vision target docs={len(docs)} pages={sum(d['pages'] for d in docs)}", flush=True)
    token = access_token()
    done = 0
    for doc in docs:
        dest = OUT / doc["id"]
        dest.mkdir(parents=True, exist_ok=True)
        for i in range(1, doc["pages"] + 1):
            jpg = PAGES / doc["id"] / f"page-{i:03d}.jpg"
            out = dest / f"page-{i:03d}.txt"
            if out.exists() and out.stat().st_size > 20:
                continue
            if not jpg.exists():
                print(f"missing {jpg}", flush=True)
                continue
            text = vision_page(token, jpg)
            out.write_text((text.strip() + "\n") if text.strip() else "[ILLEGIBLE]\n", encoding="utf-8")
            done += 1
            if done % 10 == 0:
                print(f"vision {done} pages ({doc['id']} p{i})", flush=True)
                token = access_token()
            time.sleep(0.05)
    print(f"vision done new_pages={done}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
