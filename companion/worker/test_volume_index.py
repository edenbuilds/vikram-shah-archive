"""python3 worker/test_volume_index.py - index placement proof and trailing compilations, no network."""
import volume_index as v

# A scanned exhibit whose raw OCR is padded with spaces: the model quotes the collapsed text it was shown.
padded = "Exhibit-' C *" + " " * 400 + "SLUM REHABILITATION AUTHORITY No.: SRA/ENG/2800" + " " * 50 + "\nbody"
assert v.proven(padded, "Exhibit-' C * SLUM REHABILITATION AUTHORITY No.: SRA/ENG/2800")
assert not v.proven(padded, "Exhibit D")

# 30-page volume: index p1, row 0 printed 1-3 at p2-4, row 1 printed 4-10 at p5-11, then a separate
# compilation stamped 242 onward on p12-30. The last row must stop at p11.
texts = ["INDEX Sr. No. Particulars Page No."] + [f"{i} body of the petition, " + "text " * 20 for i in range(1, 11)] + [f"{i} reply compilation, " + "text " * 20 for i in range(242, 261)]
rows = [{"particulars": "Petition", "mark": None, "from": "1", "to": "3"},
        {"particulars": "Copy of receipt", "mark": "A", "from": "4", "to": "10"}]
v.index_pages = lambda *a: []
v.chat = lambda *a, **k: {"rows": rows, "last_index_page": 1} if a[2] == "index" else {"starts": [
    {"row": 0, "page": 2, "evidence": "1 body of the petition"}, {"row": 1, "page": 5, "evidence": "4 body of the petition"}]}
parts = v.split_by_index(texts, [None] * 30)
got = [(p["title"], p["from"], p["to"]) for p in parts]
assert got == [("Index", 1, 1), ("Petition", 2, 4), ("Exhibit A: Copy of receipt", 5, 11), (v.AFTER, 12, 30)], got
print("volume index ok:", got)

# The model's reply is read by its own brackets, not first "{" to last "}", and its usual slips are tolerated.
assert v.extract_json('Per clause {7}: {"a":"x {y}","b":[1,2]} (see {note})') == {"a": "x {y}", "b": [1, 2]}
assert v.extract_json('{"q":"line one\nline two"}') == {"q": "line one\nline two"}
assert v.extract_json('```json\n{"a":[1,2,],"b":{"c":1,},}\n```') == {"a": [1, 2], "b": {"c": 1}}
try:
    v.extract_json('{"rows":[{"x":"cut off')
    raise SystemExit("a cut-off reply must not parse")
except ValueError:
    pass
print("volume index json ok")
