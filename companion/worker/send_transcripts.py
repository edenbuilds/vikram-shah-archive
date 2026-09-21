#!/usr/bin/env python3
"""Email the full text of uploaded files as Markdown attachments, one .md per source file: every
paper filed from it, in order, each with its page markers. Verbatim page text only.

  python3 worker/send_transcripts.py "<matter>::<filename>" ...
"""
import base64
import html
import sys
import urllib.parse

import notify
from corpus import rest


def transcript(mid: str, filename: str) -> tuple[str, int, int]:
    m = rest("GET", "matters", f"select=title,cause&id=eq.{urllib.parse.quote(mid)}", prefer="")[0]
    docs = rest("GET", "documents", f"select=id,title,page_count,source_path&matter_id=eq.{urllib.parse.quote(mid)}&filename=eq.{urllib.parse.quote(filename)}&order=sort", prefer="")
    out = [f"# {filename}", "", f"{m['title']}" + (f" · {m['cause']}" if m["cause"] else ""), "",
           f"{len(docs)} paper{'s' if len(docs) != 1 else ''}, {sum(d['page_count'] for d in docs)} pages. Verbatim text as read from the scans; the PDF is the record.", "", "## Contents", ""]
    out += [f"{i}. {d['title']} ({d['page_count']} pp.; {d['source_path'].split(', ', 1)[1] if ', ' in (d['source_path'] or '') else 'whole file'})" for i, d in enumerate(docs, 1)]
    for i, d in enumerate(docs, 1):
        out += ["", "---", "", f"## {i}. {d['title']}", "", f"_{d['source_path']} · open: https://case-companion.edenbuilds.me/m/{mid}/d/{d['id']}_"]
        pages = rest("GET", "document_pages", f"select=page_no,text&doc_id=eq.{urllib.parse.quote(d['id'])}&order=page_no", prefer="")
        for p in pages:
            out += ["", f"### Page {p['page_no']}", "", (p["text"] or "").strip() or "[ILLEGIBLE: no text could be read from this page]"]
    return "\n".join(out) + "\n", len(docs), sum(d["page_count"] for d in docs)


files, rows = [], ""
for arg in sys.argv[1:]:
    mid, fn = arg.split("::", 1)
    md, n, p = transcript(mid, fn)
    name = fn.rsplit(".", 1)[0].strip() + ".md"
    files.append({"filename": name, "content": base64.b64encode(md.encode()).decode()})
    rows += (f'<tr><td style="padding:9px 0;border-bottom:1px solid #efe7da;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1c1612">{html.escape(name)}'
             f'<div style="font-size:12px;color:#8a8073;margin-top:2px">{n} papers · {p} pages · {len(md.encode()) / 1e6:.1f} MB</div></td></tr>')
    print(f"{name}: {n} papers, {p} pages, {len(md.encode()) / 1e6:.2f} MB")
notify.email(f"Full text of your {len(files)} files (Markdown)", notify.page(
    "The full text of your files",
    f"Attached: {len(files)} Markdown files, one per file you uploaded. Each has every paper filed from it, in order, with a page marker for every page, so you can search, copy or feed them to any tool.",
    f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>',
    ("https://case-companion.edenbuilds.me/", "Open your workspace"),
    "Text is exactly as read from the scans. Where a page couldn't be read it says [ILLEGIBLE]; the scans and PDFs in the workspace are the record."), files)
print("sent")
