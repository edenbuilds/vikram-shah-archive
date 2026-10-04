"""How readable a page's OCR text is, so the OCR chain can try the next engine instead of filing garbage.
30-09-2026: LlamaParse returned "PAGE 6 OF 99" of the Faheem complaint as ragged one-word lines though the scan was
clean; nothing checked, so the first engine to answer won. Measured on the corpus: real words / short lines."""
import re
from functools import lru_cache

LEGAL = {"fir", "ors", "anr", "dated", "vide", "inter", "alia", "suo", "motu", "writ", "affidavit", "rera", "maharera",
         "gst", "pan", "mumbai", "pune", "thane", "maharashtra", "bombay", "advocate", "respondent", "complainant"}


@lru_cache(maxsize=1)
def _dictionary() -> frozenset:
    try:
        with open("/usr/share/dict/words", encoding="utf-8", errors="ignore") as f:
            return frozenset(w.strip().lower() for w in f) | LEGAL
    except OSError:
        return frozenset()


def _known(w: str, d: frozenset) -> bool:
    if w in d:
        return True
    for suf in ("s", "es", "ed", "d", "ing", "ly"):
        if w.endswith(suf) and w[: -len(suf)] in d:
            return True
    return False


def measure(text: str) -> dict:
    d = _dictionary()
    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z'’]+", text)]
    long = [w for w in words if len(w) >= 3]
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    tiny = sum(1 for l in lines if len(l.split()) <= 2)
    real = (sum(_known(w, d) for w in long) / len(long)) if long and d else 1.0
    return {"words": len(words), "real": real, "tiny": tiny / len(lines) if lines else 0.0}


def score(text: str) -> float:
    """Higher is more readable. Real words minus a penalty for ragged one-word lines."""
    m = measure(text)
    return m["real"] - 0.5 * m["tiny"]


def poor(text: str) -> bool:
    """True when the page looks misread: plenty of words but mostly ragged, or mostly not words."""
    m = measure(text)
    if m["words"] < 15:
        return False  # a title page, a stamp or a drawing; nothing to compare
    return m["tiny"] > 0.6 or m["real"] < 0.5
