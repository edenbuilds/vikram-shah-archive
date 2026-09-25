#!/usr/bin/env python3
"""Split a compiled court volume by its own index, automatically.

Court compilations open with an INDEX: particulars, exhibit mark, printed page range.
The printed ("stamped") page numbers are not PDF page numbers: blank backs, unnumbered
covers and interleaved translations (153A, 153B, ...) push them apart. So:

  1. find the index page and let the model transcribe its rows (verbatim particulars);
  2. read the stamped number on every PDF page, trusting a number only when nearby pages
     agree on the same pdf-minus-stamp offset;
  3. place each row at the PDF page carrying its first printed number, keeping rows in
     order and offsets from going backwards (the longest consistent chain wins);
  4. rows without a stamp between two placed rows are found by their exhibit mark, or
     estimated from the neighbouring offset.

Returns None whenever the result is not trustworthy; the caller then files the upload as
one paper, exactly as before. Nothing here invents a title: each paper is named by its
index row as printed.
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import corpus

AFTER = "Papers after the index"
INDEX_WORD = re.compile(r"\bI\s?N\s?D\s?E\s?X\b")


def find_index(texts: list[str], within: int = 12) -> int | None:
    """0-based position of the first index page, or None."""
    for i, t in enumerate(texts[:within]):
        if INDEX_WORD.search(t[:900]) and re.search(r"(?i)particulars|page\s*no|sr\.?\s*no", t):
            return i
    return None


SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["rows", "last_index_page"],
    "properties": {
        "last_index_page": {"type": "integer"},
        "rows": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["particulars", "mark", "from", "to"],
            "properties": {
                "particulars": {"type": "string"},
                "mark": {"type": ["string", "null"]},
                "from": {"type": ["string", "null"]},
                "to": {"type": ["string", "null"]},
            },
        }},
    },
}

PROMPT = """You transcribe the INDEX of an Indian court compilation from page images (OCR text of
the same pages follows each image to help with spellings; the image is authoritative for which
page numbers belong to which row, since handwritten numbers are often out of line in OCR). Return one row per
index entry, in order. "particulars": the entry's text copied as printed (fix only broken line
wraps; never add words). "mark": the exhibit/annexure mark such as "A" or "P-1", else null.
"from"/"to": the printed page numbers of the entry exactly as written (e.g. "37", "A", "215A"),
null when blank. When one serial number lists several exhibits that each have their own page
range, return each exhibit as its own row. Skip signature, place and date lines.
"last_index_page": the PDF page number (from the page labels) on which the index table ends."""


PLACE = """You place the entries of a court compilation's INDEX onto its PDF pages. You get the
index rows (numbered) and, for every PDF page, a guessed printed page number ("printed ?" when
unknown) and its first and last lines of OCR text, which carry the stamped page numbers (e.g.
"37", "(42)", "153B" on translation pages), exhibit marks ("Ex. A", "EXHIBIT-B") and headings.
For each row give the PDF page where that paper STARTS. Printed page numbers are NOT PDF page
numbers: PDF pages run ahead of them because of covers, blank backs and translation pages. A
translation of an exhibit belongs to that exhibit. Pages must increase with the row order.
"evidence": copy, character for character from that page's line, the stamp number, exhibit mark
or heading that shows the paper starts there. If you cannot find such a page, give page null."""

PLACE_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["starts"],
    "properties": {"starts": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["row", "page", "evidence"],
        "properties": {"row": {"type": "integer"}, "page": {"type": ["integer", "null"]}, "evidence": {"type": "string"}},
    }}},
}

NUM = re.compile(r"(?<![\d/.,-])\(?(\d{1,4})\)?(?![\d/.,-])")


def printed_numbers(texts: list[str]) -> dict[int, int]:
    """PDF page -> stamped number, trusted only when two nearby pages agree on the offset."""
    cand = [set()] + [{int(x) for x in NUM.findall(t[:60] + " " + t[-40:]) if 0 < int(x) < 5000} for t in texts]
    n, out = len(texts), {}
    for p in range(1, n + 1):
        for c in sorted(cand[p]):
            off = p - c
            if sum(1 for q in range(max(1, p - 6), min(n, p + 6) + 1) if q != p and (q - off) in cand[q]) >= 2:
                out[p] = c
                break
    return out


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def mark_re(mark: str) -> re.Pattern:
    return re.compile(r"(?i)\b(?:ex|exh|exhibit|annexure)\.?\s*[-–:=]?\s*[\"'“”‘’(]*\s*" + re.escape(mark) + r"(?![A-Za-z0-9])")


def proven(page_text: str, evidence: str) -> bool:
    """The model's evidence must really be on that page (not invented), and the page must not be
    a translation page (those follow the exhibit they translate). Many first pages carry no stamp,
    only a court heading, so the evidence itself need not be a number."""
    # the model sees edge(): whitespace-collapsed text. 2026-09-22: raw pdftotext on scanned exhibits
    # pads lines with spaces, so a raw 300-char window missed Exhibits A, B, C, E and F of WP 811/2024.
    flat = " ".join(page_text.split())
    zone = flat[:300] + " " + flat[-80:]
    e = norm(evidence)
    return len(e) >= 2 and e in norm(zone) and not re.search(r"(?i)translat", page_text[:150])


def chat(system: str, user, name: str, schema: dict, effort: str = "low") -> dict:
    body = {"model": corpus.LLM_MODEL, "temperature": 0, "reasoning_effort": effort,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}}}
    out = corpus._req("POST", "https://api.x.ai/v1/chat/completions", json.dumps(body).encode(),
                      {"Authorization": f"Bearer {corpus.XAI_KEY}", "Content-Type": "application/json"}, timeout=900)
    return json.loads(out["choices"][0]["message"]["content"])


def edge(t: str) -> str:
    t = " ".join(t.split())
    return "(blank)" if len(t) < 15 else (t[:220] + (" … " + t[-60:] if len(t) > 290 else ""))


PLACE_EFFORT = "medium"  # placement needs reasoning over hundreds of page edges; a non-reasoning model scored ~55% on the test volumes


def locate(texts: list[str], rows: list[dict], index_end: int) -> list[dict] | None:
    """[{row, page}] for the rows whose start is proven, pages strictly increasing, or None."""
    listing = "\n".join(f"{i}. {r['particulars'][:140]} | mark {r['mark'] or '-'} | printed pages {r['from'] or '-'} to {r['to'] or '-'}"
                        for i, r in enumerate(rows))
    guess = printed_numbers(texts)
    pages = "\n".join(f"p{p} [printed {guess.get(p, '?')}]: {edge(texts[p - 1])}" for p in range(index_end + 1, len(texts) + 1))
    got = chat(PLACE, f"INDEX ROWS\n{listing}\n\nPAGES\n{pages}", "place", PLACE_SCHEMA, PLACE_EFFORT)["starts"]
    placed, last = [], index_end
    for g in sorted(got, key=lambda g: g["row"]):
        p, i = g["page"], g["row"]
        r = rows[i] if 0 <= i < len(rows) else None
        span = (int(r["to"]) - int(r["from"])) if r and (r["from"] or "").isdigit() and (r["to"] or "").isdigit() else 0
        if p == len(texts) and span >= 1:
            continue  # a multi-page paper cannot start on the last page (seen: a back cover taken for Exhibit G)
        if p and r and last < p <= len(texts) and proven(texts[p - 1], g["evidence"]):
            placed.append({"row": i, "page": p})
            last = p
    missed = sorted(set(range(len(rows))) - {x["row"] for x in placed})
    if missed:
        print(f"  index rows not placed (merged into the paper before): {missed}", flush=True)
    return placed if len(placed) >= 2 else None


def index_pages(texts: list[str], jpgs: list, at: int) -> list[dict]:
    """Vision message content: each candidate index page as image + its OCR text."""
    content = []
    for i in range(at, min(at + 4, len(texts))):
        b64 = base64.b64encode(Path(jpgs[i]).read_bytes()).decode()
        content += [{"type": "text", "text": f"=== PDF page {i + 1} ==="},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}},
                    {"type": "text", "text": texts[i][:3000]}]
    return content


def name_parts(parts: list[dict]) -> list[dict]:
    """Index rows that list two dated documents become two papers; number them so each
    title stays unique: "(1 of 2)", "(2 of 2)"."""
    from collections import Counter
    total, seen = Counter(p["title"] for p in parts), Counter()
    for p in parts:
        if total[p["title"]] > 1:
            seen[p["title"]] += 1
            p["title"] = f"{p['title']} ({seen[p['title']]} of {total[p['title']]})"
    return parts


def split_nested(texts: list[str], jpgs: list, depth: int = 0) -> list[dict] | None:
    """split_by_index, then once more inside any paper of 40+ pages that opens with its own
    index (e.g. a complaint annexed as one exhibit, with its own exhibits)."""
    parts = split_by_index(texts, jpgs)
    if not parts or depth:
        return parts
    out = []
    for p in parts:
        a, b = p["from"], p["to"]
        inner = split_nested(texts[a - 1:b], jpgs[a - 1:b], depth + 1) if b - a + 1 >= 40 else None
        if inner and len(inner) > 2 and p["title"] == AFTER:
            out += [{**q, "from": q["from"] + a - 1, "to": q["to"] + a - 1} for q in inner]  # a separate compilation: its own titles
        elif inner and len(inner) > 2:
            label = f"Exhibit {p['mark']}" if p.get("mark") else p["title"][:40].rstrip(" ,.-")
            for q in inner:
                title = p["title"] if q["title"] == "Index" else f"{label} › {q['title']}"
                out.append({"title": title, "from": q["from"] + a - 1, "to": q["to"] + a - 1, "parent": p["title"]})
        else:
            out.append(p)
    return name_parts(out)


def split_by_index(texts: list[str], jpgs: list) -> list[dict] | None:
    """[{title, from, to}] tiling the whole volume (1-based PDF pages), or None."""
    if len(texts) < 20:
        return None
    at = find_index(texts)
    if at is None:
        return None
    idx = chat(PROMPT, index_pages(texts, jpgs, at), "index", SCHEMA)
    rows = idx["rows"]
    end = min(max(idx["last_index_page"], at + 1), at + 4, len(texts))  # 1-based last index page
    while end < len(texts) and len(texts[end].strip()) < 60:
        end += 1  # blank back of the last index page
    placed = locate(texts, rows, end)
    if not placed:
        return None
    n, first = len(texts), placed[0]
    parts = []
    if at > 0:
        parts.append({"title": "Papers before the index", "from": 1, "to": at})
    parts.append({"title": "Index", "from": at + 1, "to": end})
    if first["page"] > end + 1:
        head = [r["particulars"].strip() for r in rows[:first["row"]] if r["from"] and not r["from"].strip().isdigit()]
        parts.append({"title": "; ".join(head) or "Front matter", "from": end + 1, "to": first["page"] - 1})
    end_last = n
    r = rows[placed[-1]["row"]]
    if (r["from"] or "").strip().isdigit() and (r["to"] or "").strip().isdigit():
        stop = placed[-1]["page"] + int(r["to"]) - int(r["from"])
        # 2026-09-22 WP 811/2024: a reply compilation (its own index, stamped 242 on) was bound after
        # the Vakalatnama row and filed as "Vakalatnama". Cut where the stamps stop continuing the row.
        if stop < n and printed_numbers(texts).get(stop + 1) not in (None, int(r["to"]) + 1):
            end_last = stop
    for k, x in enumerate(placed):
        r = rows[x["row"]]
        title = " ".join(r["particulars"].split())
        if r["mark"] and not re.search(r"(?i)\b(ex|exh|exhibit|annexure)\b", title):
            title = f"Exhibit {r['mark']}: {title}"
        parts.append({"title": title, "mark": (r["mark"] or "").strip(), "from": x["page"],
                      "to": placed[k + 1]["page"] - 1 if k + 1 < len(placed) else end_last})
    if end_last < n:
        parts.append({"title": AFTER, "from": end_last + 1, "to": n})
    pages = [i for p in parts for i in range(p["from"], p["to"] + 1)]
    return parts if pages == list(range(1, n + 1)) else None


STAGE = """Assign each paper of a court compilation to one stage of the matter's filing tree. Use the
stage ids given. Judge only from the paper's title as printed in the index."""


def assign_stages(titles: list[str], stages: list[dict], default: str) -> list[str]:
    ids = [s["id"] for s in stages]
    schema = {"type": "object", "additionalProperties": False, "required": ["papers"],
              "properties": {"papers": {"type": "array", "items": {
                  "type": "object", "additionalProperties": False, "required": ["row", "stage"],
                  "properties": {"row": {"type": "integer"}, "stage": {"type": "string", "enum": ids}}}}}}
    tree = "\n".join(f"{s['id']}: {s['title']}" for s in stages)
    listing = "\n".join(f"{i}. {t}" for i, t in enumerate(titles))
    try:
        got = {g["row"]: g["stage"] for g in chat(STAGE, f"STAGES\n{tree}\n\nPAPERS\n{listing}", "stages", schema)["papers"]}
    except Exception as e:  # noqa: BLE001  the advocate's chosen stage is a fine fallback
        print(f"  stage sorting skipped: {e}", flush=True)
        got = {}
    return [got.get(i, default) for i in range(len(titles))]
