# Keyword search over every dataset (brief 18)

One keyword index over the lake's records, served by `/search` and `/suggest` on Lambda `nsr-api`
(`services/nsr-api/keyword_search.py`). Full text, not meaning: NSR's meaning search (`nsr-search`) is separate.

| Path | What |
| --- | --- |
| `lake/serve/search/2026-11-08/docs/` | `nsr.search_docs`: EXFOR datasets and entries, NSR references, XUNDL datasets (`docs.sql`) |
| `lake/serve/search/2026-11-08/docs_structure/` | `nsr.search_docs_structure`: nuclides, levels, decays, ENSDF datasets, ENDF/B (parsing-1) |
| `lake/serve/search/2026-11-08/nsr/` | `nsr.search_nsr`: one row per NSR reference, for `/nsr/{key}` (`nsr.sql`) |
| `lake/serve/search/2026-11-08/search.duckdb` | the index: records, DuckDB full-text index, suggest table (`index.py`) |
| `lake/serve/search/2026-11-08/manifest.json` | sources, rows per type, bytes, build time, checks (`manifest.py`) |

Columns of both docs tables: type, id, name, title, text, keywords, dataset, z, a, mt, year, url_path.

## How the index reads text

Tokens are split on anything but letters, digits and `-`, lower-cased, without stemming or stop words, so nuclide names
stay whole. For each record `index.py` adds every spelling of each nuclide it names (U-235, 235U, U235; Fe-nat, natFe),
from z and a and from the nuclides found in its text, and both forms of words people type either way (gamma/gammas,
half-life/half life, cross section/cross-section). The query uses DuckDB fts's BM25F formula over the index tables
(`test_direct.py` checks it gives the same scores as `fts_main_docs.match_bm25`).

## Rerun

On the parse box (`../exfor/create.sh`, role widened by `role.sh`), scripts synced to `/opt/nsr/scripts/search/` beside
the exfor scripts:

1. `docs.py` (UNLOAD and register `search_docs`), `unload.py nsr` (`search_nsr`).
2. `index.py` (reads `docs` and `docs_structure`, builds and uploads `search.duckdb`; about 2.5 minutes).
3. `test_queries.py /data/search/search.duckdb`, then `manifest.py`.
4. The Lambda: `services/nsr-api/build.sh` on the box, `services/nsr-api/deploy.sh` on the Mac. A new index is read on
   each container's next cold start; run `deploy.sh` to start fresh containers at once.
