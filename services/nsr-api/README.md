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

parsing-1 adds `/nuclide/*` and `/endf/*` here.
