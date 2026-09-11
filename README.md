# Shah v. Trindade — paper archive

Public reading copy of papers in *Mr. Vikram Shah v. Mrs. Riva Trindade & Ors.*

This archive restates a party's papers. It is not an award, not legal advice, and not a determination of fact.

## Run locally

```bash
chmod +x startup.sh
./startup.sh
```

Serves `public/` on `0.0.0.0:8080`.

## Rebuild transcripts

Requires Firecrawl (`FIRECRAWL_API_KEY`) for scanned PDFs.

```bash
python3 scripts/firecrawl_parse.py
python3 scripts/assemble.py
```
