"""python3 worker/test_worker.py - section page ranges come from real page markers."""
from worker import sectioned

texts = ["APPLICATION UNDER SECTION 17\nThe Claimant prays as follows."] + [f"Body text of page {i}." for i in range(2, 11)]
texts[4] = "ANNEXURE A\nCopy of the sale deed."   # page 5
texts[7] = "ANNEXURE B\nCopy of the receipt."     # page 8
texts[9] = ""                                     # page 10: nothing readable

body, secs = sectioned("Test application", texts)
got = [(s["mark"], s["pageStart"], s["pageEnd"]) for s in secs]
assert [(a, b) for _, a, b in got] == [(1, 4), (5, 7), (8, 10)], got
assert "ANNEXURE A" in got[1][0] and "ANNEXURE B" in got[2][0], got
assert body.count("[ILLEGIBLE") == 1 and "## Page 10 of 10" in body
print("worker section mapping ok:", got)
