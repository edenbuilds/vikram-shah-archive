"""Tell the advocate when an upload is filed (or failed): Telegram to her chat, email to
NOTIFY_EMAILS via Resend from the verified edenbuilds.me domain. A notification that can't be
sent is logged and never fails the job."""
from __future__ import annotations

import html
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import corpus
from corpus import rest

ORIGIN = os.environ.get("APP_ORIGIN", "https://case-companion.edenbuilds.me")
FROM = "Case Companion <companion@edenbuilds.me>"


def _post(url: str, body: dict, headers: dict) -> None:
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", **headers}, method="POST")
    urllib.request.urlopen(req, timeout=30, context=corpus.TLS).read()


def members(mid: str | None) -> set[str] | None:
    """Emails with access to a matter; notifications about a matter go only to them."""
    if not mid:
        return None
    return {r["email"].lower() for r in rest("GET", "matter_members", f"select=email&matter_id=eq.{urllib.parse.quote(mid)}", prefer="")}


def linked() -> dict[str, str]:
    out = {}
    for p in os.environ.get("TELEGRAM_USERS", "").split(","):
        if "=" in p:
            c, e = p.split("=", 1)
            out[c.strip()] = e.strip().lower()
    try:
        raw = corpus.storage_get("_system/telegram-users.json")
        out.update(raw if isinstance(raw, dict) else json.loads(raw))
    except Exception:  # noqa: BLE001
        pass
    return out


def muted() -> bool:
    # ponytail: one switch in .env.local; Omkar asked to stop the Ready/failed messages on 22-09-2026 (test uploads were mailing everyone)
    return os.environ.get("NOTIFY_MUTED", "") == "1"


def telegram(text: str, mid: str | None = None) -> None:
    if muted():
        return
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    allowed = members(mid)
    for chat, who in linked().items():
        if allowed is not None and who not in allowed:
            continue
        try:
            _post(f"https://api.telegram.org/bot{token}/sendMessage", {"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}, {})
        except Exception as e:  # noqa: BLE001
            print(f"  telegram notify failed: {e}", file=sys.stderr, flush=True)


def email(subject: str, body_html: str, attachments: list[dict] | None = None, mid: str | None = None) -> None:
    if muted():
        return
    allowed = members(mid)
    to = [e.strip() for e in os.environ.get("NOTIFY_EMAILS", "").split(",") if e.strip() and (allowed is None or e.strip().lower() in allowed)]
    if not to or not os.environ.get("RESEND_API_KEY"):
        return
    try:
        _post("https://api.resend.com/emails", {"from": FROM, "to": to, "subject": subject, "html": body_html, **({"attachments": attachments} if attachments else {})},
              {"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}", "User-Agent": "case-companion-worker"})
    except Exception as e:  # noqa: BLE001
        print(f"  email notify failed: {e}", file=sys.stderr, flush=True)


def page(title: str, lede: str, rows_html: str, button: tuple[str, str] | None, foot: str) -> str:
    """Paper-toned email: serif title, seal-red accent, one clear button. Inline styles only."""
    btn = (f'<a href="{button[0]}" style="display:inline-block;background:#8b2e2e;color:#fffdf8;text-decoration:none;'
           f'font-weight:600;padding:12px 22px;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:15px">{html.escape(button[1])}</a>') if button else ""
    return f"""<!doctype html><html><body style="margin:0;background:#f4eee4;padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf8;border:1px solid #e3d9c7;border-radius:14px">
<tr><td style="padding:28px 32px 8px;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:34px;height:34px;border-radius:17px;background:#8b2e2e;color:#f4eee4;text-align:center;font-family:Georgia,serif;font-size:12px">CC</td>
<td style="padding-left:10px;font-family:Georgia,serif;font-size:15px;color:#1c1612">Case Companion</td></tr></table>
</td></tr>
<tr><td style="padding:14px 32px 0"><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1c1612">{html.escape(title)}</h1>
<p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#5c5348">{lede}</p></td></tr>
<tr><td style="padding:20px 32px 4px">{rows_html}</td></tr>
<tr><td style="padding:18px 32px 28px">{btn}</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #e3d9c7;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8a8073">{foot}</td></tr>
</table></td></tr></table></body></html>"""


def job_done(job: dict) -> None:
    mid = job["matter_id"]
    m = rest("GET", "matters", f"select=title,stages&id=eq.{urllib.parse.quote(mid)}", prefer="")[0]
    stage = {s["id"]: s["title"] for s in m["stages"]}
    docs = rest("GET", "documents", f"select=id,title,stage,page_count&matter_id=eq.{urllib.parse.quote(mid)}"
                f"&filename=eq.{urllib.parse.quote(job['filename'])}&ingested_at=gte.{urllib.parse.quote(job['created_at'])}&order=sort", prefer="")
    if not docs:  # the same bytes were already filed earlier
        docs = rest("GET", "documents", f"select=id,title,stage,page_count&id=eq.{urllib.parse.quote(job['doc_id'] or '')}", prefer="")
    pages = sum(d["page_count"] for d in docs)
    link = lambda d: f"{ORIGIN}/m/{mid}/d/{d['id']}"  # noqa: E731
    what = f"{len(docs)} papers, {pages} pages" if len(docs) > 1 else f"{pages} pages"

    lines = "\n".join(f"• <a href=\"{link(d)}\">{html.escape(d['title'])}</a> ({d['page_count']} pp.)" for d in docs[:25])
    more = f"\n…and {len(docs) - 25} more" if len(docs) > 25 else ""
    telegram(f"<b>Ready:</b> {html.escape(job['title'])}\n{html.escape(m['title'])}: {what}\n\n{lines}{more}\n\n{ORIGIN}/m/{mid}/map", mid)

    rows = "".join(
        f'<tr><td style="padding:10px 0;border-bottom:1px solid #efe7da;font-family:Georgia,serif;font-size:15px;line-height:1.35">'
        f'<a href="{link(d)}" style="color:#1c1612;text-decoration:none">{html.escape(d["title"])}</a>'
        f'<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a8073;margin-top:3px">{html.escape(stage.get(d["stage"], d["stage"]))} · {d["page_count"]} pages</div></td></tr>'
        for d in docs)
    email(f"Ready: {job['title']} ({what})", page(
        "Your papers are ready",
        f"<b style=\"color:#1c1612\">{html.escape(job['filename'])}</b> has been read page by page and filed in "
        f"<b style=\"color:#1c1612\">{html.escape(m['title'])}</b>: {what}." + (" It was split into its papers using the volume's own index." if len(docs) > 1 else ""),
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>',
        (f"{ORIGIN}/m/{mid}/map", "Open the matter"),
        "Every page keeps its original scan beside the text. Unreadable pages are marked [ILLEGIBLE], never guessed.<br>Sent by Case Companion to the people with access to this matter."), mid=mid)


def job_failed(job: dict, error: str) -> None:
    mid = job["matter_id"]
    telegram(f"<b>Couldn't file:</b> {html.escape(job['title'])}\n{html.escape(error[:500])}\n\nTry again or upload on the website: {ORIGIN}/m/{mid}/upload", mid)
    email(f"Couldn't file: {job['title']}", page(
        "An upload needs another try",
        f"<b style=\"color:#1c1612\">{html.escape(job['filename'])}</b> could not be processed.",
        f'<p style="margin:0;padding:12px 14px;background:#f3e3de;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6f2424">{html.escape(error[:800])}</p>',
        (f"{ORIGIN}/m/{mid}/upload", "Open uploads"),
        "Uploading the same file again is safe: papers already filed from it are updated, not duplicated."), mid=mid)


def ready_digest(files: list[tuple[str, str]]) -> None:
    """One "your papers are ready" message covering several source files: (matter_id, filename)."""
    blocks, tg_lines, total_p, total_d = [], [], 0, 0
    for mid in dict.fromkeys(m for m, _ in files):
        m = rest("GET", "matters", f"select=title,cause&id=eq.{urllib.parse.quote(mid)}", prefer="")[0]
        rows = ""
        for _, fn in (x for x in files if x[0] == mid):
            docs = rest("GET", "documents", f"select=id,page_count&matter_id=eq.{urllib.parse.quote(mid)}&filename=eq.{urllib.parse.quote(fn)}", prefer="")
            p = sum(d["page_count"] for d in docs)
            total_p += p; total_d += len(docs)
            rows += (f'<tr><td style="padding:8px 0;border-bottom:1px solid #efe7da;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1c1612">{html.escape(fn)}'
                     f'<div style="font-size:12px;color:#8a8073;margin-top:2px">{len(docs)} paper{"s" if len(docs) != 1 else ""} · {p} pages</div></td></tr>')
            tg_lines.append(f"• {html.escape(fn)}: {len(docs)} paper{'s' if len(docs) != 1 else ''}, {p} pages")
        blocks.append(f'<div style="margin:0 0 22px"><a href="{ORIGIN}/m/{mid}/map" style="font-family:Georgia,serif;font-size:17px;color:#8b2e2e;text-decoration:none">{html.escape(m["title"])}</a>'
                      f'<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a8073;margin:3px 0 6px">{html.escape(m["cause"] or "")}</div>'
                      f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table></div>')
    lede = (f"{len(files)} files have been read page by page and filed as <b style=\"color:#1c1612\">{total_d} separate papers ({total_p:,} pages)</b>, "
            "each named as its volume's index lists it, with the original scan beside the text.")
    email(f"Your papers are ready: {total_d} papers, {total_p:,} pages", page(
        "Your papers are ready", lede, "".join(blocks), (f"{ORIGIN}/", "Open your workspace"),
        "Ask the papers anything on the site, in Telegram (@arya_case_archivebot) or from ChatGPT and Claude (connect them in Settings). "
        "Answers come only with exact quotes and page links; anything not in the papers is reported as not found.<br>Sent by Case Companion to the workspace owners."))
    telegram("<b>Your papers are ready</b>\n" + "\n".join(tg_lines) +
             f"\n\n{total_d} papers, {total_p:,} pages in all.\n\nSend me a PDF or a photo any time and I'll file it. Ask me a question in plain words and I'll answer only from the papers, with page links.\n/matters · /status · /link\n\n{ORIGIN}/")


if __name__ == "__main__" and sys.argv[1:2] == ["digest"]:
    ready_digest([tuple(a.split("::", 1)) for a in sys.argv[2:]])
