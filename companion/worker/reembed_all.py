"""Re-embed every chunk with corpus.EMBED_MODEL (04-10-2026: OpenAI vectors -> Gemini via the AI Gateway).
Vectors from two models can't be compared, so all rows are rewritten. Resumable: python3 worker/reembed_all.py [after_id] [up_to_id]  (run several ranges side by side)"""
import http.client
import json
import sys
import time
import urllib.parse
import corpus

# 04-10-2026: a PATCH per row on fresh connections ran the Mac out of local ports (Errno 49), and an
# upsert can't carry ids (identity column). So: one PATCH per row over one kept-alive connection.
host = urllib.parse.urlparse(corpus.SUPABASE_URL).netloc
conn = http.client.HTTPSConnection(host, timeout=60, context=corpus.TLS)
head = {**corpus._auth(), "Content-Type": "application/json", "Prefer": "return=minimal"}


def patch(cid: int, vec: list) -> None:
    global conn
    for k in range(4):
        try:
            conn.request("PATCH", f"/rest/v1/chunks?id=eq.{cid}", json.dumps({"embedding": vec}), head)
            r = conn.getresponse()
            body = r.read()
            if r.status < 300:
                return
            # 04-10-2026: under six parallel writers Postgres hit its statement timeout (57014, a 500); retry.
            if r.status < 500 or k == 3:
                raise RuntimeError(f"{r.status}: {body[:200]!r}")
            time.sleep(2 ** k)
        except (OSError, http.client.HTTPException):
            conn.close()
            conn = http.client.HTTPSConnection(host, timeout=60, context=corpus.TLS)
            time.sleep(2 ** k)
    raise RuntimeError(f"chunk {cid}: gave up after retries")


last = int(sys.argv[1]) if len(sys.argv) > 1 else 0
upto = int(sys.argv[2]) if len(sys.argv) > 2 else 1 << 62
done = 0
while True:
    rows = corpus.rest("GET", "chunks", f"select=id,text&id=gt.{last}&id=lte.{upto}&order=id&limit=96", prefer="")
    if not rows:
        break
    for r, v in zip(rows, corpus.embed([r["text"] for r in rows])):
        patch(r["id"], v)
    last, done = rows[-1]["id"], done + len(rows)
    print(f"{done} re-embedded, last id {last}", flush=True)
print("all done", flush=True)
