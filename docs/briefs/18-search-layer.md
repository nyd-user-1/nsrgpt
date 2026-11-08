# 18 — The search layer: one index over every dataset, behind the cached API (2026-11-08, overnight)

You're `parsing-2`, continuing from brief 16 (EXFOR tables, serving tables and the `nsr-api` Lambda are yours).
Brendan authorized this overnight work through agent-1; he reads the results in the morning. Report to agent-1 with
SendMessage (name `agent-1`) after each step, 3–5 lines, Efficiency Voice. Blockers go to agent-1; don't stop.
The standing rules of brief 16 hold (Mac rules, no commits, write only in `scripts/parse/search/` (new),
`services/nsr-api/` (shared with parsing-1, who adds nuclide and ENDF routes: add, don't rewrite), the lake prefixes
below, `INVENTORY.md` rows; spend cap $3; free routes first).

Today search covers NSR only (meaning search over references, Lambda `nsr-search`, `work/search/v1/`; leave it as
it is). This brief adds a second kind: a keyword index over every record the lake holds, so "U-235 fission cross
section", "60Co gammas", "Cs-137 half-life", "subentry 10001002", "JEFF-3.3 Fe-56" each find their records in under
a second, with the record's type, id and a link into the API. Full text, not meaning.

## The documents table
1. `lake/serve/search/2026-11-08/docs` … one row per searchable record, from every parsed dataset:
   - EXFOR: entries (id, title, authors, institute, year, reaction strings), subentries (id, reaction, target,
     quantity, product, energy range, year, first author).
   - ENSDF and XUNDL: datasets (nucid, dsid, publication, date), nuclides (name, Z, N, A, half-life, modes).
   - ENDF/B: materials (release, sublibrary, mat, za, name), MF3 sections (name, mt, mt name).
   - NSR: references (key number, title, first author, year, keywords) from `lake/nsr-database/`.
   - parsing-1 writes its share (nuclides, levels, decays, materials, sections) into the same table shape under
     the same prefix as `docs_structure`; read both at index time.
   Columns: type, id, name, title, text, keywords (array), dataset, z, a, mt, year, url_path (the API path that
   returns the record, e.g. `/exfor/subentry/10001002`, `/nuclide/137Cs`, `/endf/xs?name=U-235&mt=18`).
2. Build it with Athena UNLOAD from the tables you and parsing-1 registered; register it as `nsr.search_docs`.

## The index
1. DuckDB full-text search (the `fts` extension, BM25) over `docs` with stemming off and the nuclide tokens kept
   whole ("U-235", "235U", "Cs-137" all map to the same name: write `text` with every spelling). Build the index
   on the box into one DuckDB file `lake/serve/search/2026-11-08/search.duckdb` (keep it under about 1 GB; drop
   columns the results don't show).
2. Lambda `nsr-api`, new route `GET /search?q=&type=&limit=` … on cold start copy `search.duckdb` to `/tmp` (one
   S3 read; say how long it takes), query with `fts_main_docs.match_bm25`, return `{hits: [{type, id, name, title,
   score, url_path}], total, took_ms}`. Type filter optional; default 25 hits, max 200. Suggest-as-you-type:
   `GET /suggest?q=` returns up to 10 names that start with the prefix (nuclides, reactions, authors) from a small
   sorted table in the same file.
3. Cache through the same CloudFront, 1 hour, keyed on the query string.
4. Latency targets: cold under 8 s (report it), warm under 0.3 s, cached under 0.1 s. If the file is too big for a
   fast cold start, shard by type or trim text; say what you chose.

## Verify (from the Mac, curl, and report each latency)
`/search?q=U-235 fission`, `/search?q=60Co gammas`, `/search?q=10001002`, `/search?q=JEFF-3.3 Fe-56`,
`/search?q=Janssens 2011`, `/suggest?q=Cs-1`. Each must return the record you'd expect in its first three hits;
if one doesn't, fix the text column, don't tune the query.

## Done means
1. `nsr.search_docs` registered, `search.duckdb` in the lake, a manifest (sources, rows per type, bytes, build time).
2. `/search` and `/suggest` live and documented in `services/nsr-api/README.md`; latencies reported.
3. `INVENTORY.md` row for `lake/serve/search`.
4. A final report to agent-1: rows per type, bytes, spend, the six verification results. Terminate any box you start.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/18-search-layer.md and start; report to agent-1 after each step.`
