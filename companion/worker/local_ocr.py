"""Free OCR engines that run on this Mac, used as fallbacks after Google Vision and LlamaParse.
04-10-2026: Omkar asked for OCRmyPDF, PaddleOCR, surya, docling, marker and MinerU as fallbacks, so a
scanned page is still read when the paid engines are down or out of credit. Each engine is its own
CLI (installed with `uv tool install`, kept out of the worker's Python) and is skipped when absent.
Order: OCR_CHAIN in the worker env, e.g. "ocrmypdf,google-vision,..." puts the free engine first."""
from __future__ import annotations

import contextlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

LANGS = os.environ.get("TESSERACT_LANGS", "eng+mar+hin")  # Marathi and Hindi papers are common here
# ponytail: one ML engine at a time; six torch processes side by side would swap the Mac to a halt.
# Per-engine locks (or a long-lived server per engine) if fallbacks ever become the main path.
HEAVY = threading.Semaphore(1)

# name -> (binary, argv after the binary; {img} and {out} are filled in)
ENGINES: dict[str, tuple[str, list[str]]] = {
    "ocrmypdf": ("ocrmypdf", ["-l", LANGS, "--image-dpi", "200", "--output-type", "pdf", "--optimize", "0",
                             "--sidecar", "{out}/page.txt", "{img}", "{out}/page.pdf"]),
    "paddleocr": ("paddleocr", ["ocr", "-i", "{img}", "--save_path", "{out}", "--lang", os.environ.get("PADDLE_LANG", "mr")]),
    "surya": ("surya_ocr", ["{img}", "--output_dir", "{out}"]),
    "docling": ("docling", ["{img}", "--to", "md", "--output", "{out}"]),
    "marker": ("marker_single", ["{img}", "--output_dir", "{out}", "--output_format", "markdown"]),
    "mineru": ("mineru", ["parse", "{img}", "-o", "{out}/page.md", "--force", "--no-marker"]),  # 3.x CLI
}
LIGHT = {"ocrmypdf"}


def which(binary: str) -> str | None:
    return shutil.which(binary) or next((str(p) for p in [Path.home() / ".local/bin" / binary, Path("/opt/homebrew/bin") / binary] if p.exists()), None)


def harvest(out: Path) -> str:
    """The text an engine wrote: its Markdown, else its sidecar text, else the strings in its JSON."""
    for pattern in ("*.md", "*.txt"):
        for f in sorted(out.rglob(pattern)):
            t = f.read_text(errors="replace")
            return re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t).replace("[OCR skipped on page(s) 1]", "").strip()
    texts: list[str] = []

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k == "rec_texts" and isinstance(v, list):
                    texts.extend(s for s in v if isinstance(s, str))
                elif k == "text" and isinstance(v, str):
                    texts.append(v)
                else:
                    walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    for f in sorted(out.rglob("*.json")):
        walk(json.loads(f.read_text(errors="replace")))
    if not texts and not any(out.rglob("*.json")):
        raise RuntimeError("wrote no text")
    return "\n".join(texts).strip()


def run(name: str, img: Path, timeout: int = 900) -> str:
    binary, args = ENGINES[name]
    exe = which(binary)
    if not exe:
        raise RuntimeError(f"{binary} not installed")
    with tempfile.TemporaryDirectory() as d:
        argv = [exe, *[a.format(img=img, out=d) for a in args]]
        env = {**os.environ, "PATH": f"{Path(exe).parent}:/opt/homebrew/bin:/usr/bin:/bin"}
        lock = contextlib.nullcontext() if name in LIGHT else HEAVY
        with lock:
            r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, env=env)
        if r.returncode:
            raise RuntimeError(f"{name} exit {r.returncode}: {(r.stderr or r.stdout)[-300:]}")
        return harvest(Path(d))


def available() -> list[str]:
    return [n for n, (b, _) in ENGINES.items() if which(b)]


if __name__ == "__main__":
    # Self-check of the output readers (no engine needed), then each installed engine on a page image
    # passed as argv[1]: python3 worker/local_ocr.py page.jpg
    import sys
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "a").mkdir()
        (p / "a" / "res.json").write_text(json.dumps({"rec_texts": ["IN THE HIGH COURT", "OF BOMBAY"]}))
        assert harvest(p) == "IN THE HIGH COURT\nOF BOMBAY"
        (p / "a" / "page.md").write_text("![](img.png)\n# Writ Petition")
        assert harvest(p) == "# Writ Petition"
    print("local_ocr self-check ok; installed:", ", ".join(available()) or "none")
    for n in (sys.argv[2:] or available()) if len(sys.argv) > 1 else []:
        import time
        t0 = time.time()
        try:
            t = run(n, Path(sys.argv[1]).resolve())
            print(f"{n}: {len(t)} chars in {time.time() - t0:.0f}s :: {t[:90]!r}")
        except Exception as e:  # noqa: BLE001
            print(f"{n}: FAILED in {time.time() - t0:.0f}s :: {str(e)[:200]}")
