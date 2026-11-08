# nsr-api

One Lambda (`nsr-api`, Python 3.12, DuckDB) behind API Gateway HTTP API `3o2ps7jan4` and CloudFront. Every response is
JSON; CloudFront keeps each one for an hour, keyed on the whole query string.

- CDN: `https://daw1qggkn69lv.cloudfront.net`
- Origin: `https://3o2ps7jan4.execute-api.us-east-2.amazonaws.com`

## Files

| File | Routes | Owner |
| --- | --- | --- |
| `lambda_function.py` | `/exfor/*`; sends the other prefixes to their module (`MODULES`) | parsing-2 (briefs 16, 18) |
| `keyword_search.py` | `/search`, `/suggest`, `/nsr/{key}` | parsing-2 (brief 18) |
| `structure.py` | `/nuclide/*`, `/endf/*` | parsing-1 (brief 17) |
| `build.sh` | builds the package on a parse box (every `*.py` here, DuckDB, the httpfs and fts extensions) and puts it in S3 | |
| `deploy.sh` | creates or updates the Lambda, the HTTP API and CloudFront from the package in S3 | |
| `test_box.py` | runs the handler on a parse box before deploying | |
| `test_structure.py` | runs structure.py's routes on a parse box before deploying | parsing-1 (brief 17) |

A module has `route(path, query)` returning `(status, body)`; `lambda_function.py` imports it on first use, so a cold
start loads only what its route needs.

## Deploy

```
aws s3 cp services/nsr-api/ s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/ --recursive --exclude '*' --include '*.py' --include '*.sh'
./scripts/iaea/box/ssm.sh <box> 'aws s3 cp s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/build.sh /tmp/ && bash /tmp/build.sh'
./services/nsr-api/deploy.sh
```

Tell the other owner before deploying; the last deploy ships whatever `*.py` files are in the S3 folder.

## EXFOR (lake/serve/exfor/2026-10-28/, lake/exfor/j4-2026-10-28/)

| Route | Example |
| --- | --- |
| `GET /exfor/search` | `/exfor/search?target=U-235&reaction=N,F&quantity=SIG&energy=1e6..2e7&page=1` |
| `GET /exfor/subentry/{id}` | `/exfor/subentry/10003002` (subentry) or `/exfor/subentry/O04060152` (dataset: subentry + pointer) |
| `GET /exfor/pickers/{name}` | `/exfor/pickers/targets`, `reactions`, `quantities` |

`/exfor/search` fields: `target`, `reaction`, `quantity`, `product`, `author`, `institute`, `acc`, `year`, `energy` (or
`emin`, `emax`), in eV; `sort` = `reaction`, `year` or `acc`; 100 rows a page. Syntax as on nds.iaea.org/exfor: `;` for
alternatives, a leading `^` excludes, `*` is a wildcard, `a..b` is a range.

## Search (lake/serve/search/2026-11-08/)

| Route | Example |
| --- | --- |
| `GET /search` | `/search?q=U-235 fission`, `/search?q=60Co gammas&type=nuclide`, `/search?q=10001002&limit=5` |
| `GET /suggest` | `/suggest?q=Cs-1` |
| `GET /nsr/{key}` | `/nsr/2011JA06` |

`/search` returns `{q, hits: [{type, id, name, title, score, url_path}], total, took_ms}`: BM25 over every record's
words, no stemming, nuclide names kept whole (U-235, 235U and U235 all match). `type` takes one or more of
`exfor_dataset`, `exfor_entry`, `nsr`, `nuclide`, `level`, `decay`, `dataset` (ENSDF and XUNDL), `material`,
`cross_section` (comma-separated); `limit` defaults to 25,
at most 200. `url_path` is the route that returns the record. `/suggest` returns up to 10 names starting with `q`:
nuclides, reactions and author surnames, the ones in the most records first.

The index is one DuckDB file, `search.duckdb`, built by `scripts/parse/search/index.py`. A cold start copies it to
`/tmp` in one S3 read; the first response after a cold start carries `cold_start` with the copy and open times. A
rebuilt index loads on each container's next cold start; to load it at once, set the Lambda variable
`SEARCH_INDEX_BUILT` to the build time (any change starts fresh containers; keep other variables when you set it).

## Structure and evaluated libraries (parsing-1, brief 17)

Serving tables: `lake/serve/nuclide/2026-11-05/` (ENSDF 2026-11-05) and `lake/serve/endf/<release>/` (`nsr.nuclide_serve_*`,
`nsr.endf_serve_*`), built by `scripts/parse/serve-structure/serve.py`.

| Route | Example |
| --- | --- |
| `GET /nuclide/{name}` | `/nuclide/137Cs` (also `cs-137`, `CS137`, `137-Cs`); `?levels=50` caps the level and gamma lists |
| `GET /nuclide/{name}/levels` | `/nuclide/60Ni/levels?page=2` |
| `GET /nuclide/{name}/gammas` | `/nuclide/60Co/gammas` |
| `GET /endf/materials` | `/endf/materials?release=B-VIII.1&sublibrary=neutrons&z=92`; `release=all`; `name=U-235` |
| `GET /endf/xs` | `/endf/xs?name=U-235&mt=18`, `&compare=B-VIII.0,B-VII.1`, `&temp=293.6K`, `&point=0`, `&sub=protons` |
| `GET /endf/mt` | `/endf/mt` |

`/nuclide/{name}` returns the nuclide (Z, N, half-life in seconds and as written, decay modes with percentages, ground-state
J-pi, adopted Q-values, counts), its adopted levels and gammas (each gamma with the level it leaves and, where the energy
difference picks one level, the level it reaches), and its decays as parent and as daughter. `/levels` and `/gammas` page
by 500.

`/endf/xs` returns one series per release: `energy_ev` and `xs_barn` arrays with the section's interpolation, Q-values
and point counts. Defaults: release `B-VIII.1`, sublibrary `neutrons`, `temp=0K`. Where NNDC's reconstructed POINT
library holds the section (B-VIII.1 and B-VIII.0, at 0K or 293.6K) it is served instead of the bare MF3, because inside a
resonance range MF3 holds only the background; `release_served` names the release that answered, and `point=0` asks for
the MF3 itself. POINT series over 40,000 points are thinned for charting to the lowest and highest point in each of
20,000 log-energy steps (`thinned`, `n_points`, `n_served`); every point is in `nsr.endfb_xs_points`. A release the lake
does not hold (`compare=JEFF-3.3`) comes back with `held: false`.

The POINT rows are read through `lake/serve/endf/<release>/xs_index/` (held in memory) and `xs_series/series.bin` (one S3
byte-range request a section). Measured through CloudFront on 2026-11-08 with a warm Lambda: first requests 0.17–0.40 s
(a POINT cross section 0.27–0.34 s; a two-release POINT compare 0.82 s while it loads the second index), cached
0.05–0.13 s. A container's first nuclide request loads the nuclide tables (about 1 s); a cold start is about 4–5 s.
