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

## Dataset records (brief 34, dataset.py)

One record per dataset, for the dataset pages (brief 33). Every record carries `graph`: the node Graph draws for it and
its links, so "Open in Graph" needs nothing else:
`{"node": {"type", "id", "label", "sub"}, "links": [{"type", "id", "label", "rel"}]}`. Node types are Graph's own
(`nuclide` id = NUCID as 60CO, `paper` id = NSR key number, `exfor` id = entry number) plus `dataset` (id = source:NUCID:DSID)
and `material` (id = release:MAT). `rel` says what the link is: `nuclide`, `reference` (a paper cited), `parent` (a
dataset's adopted dataset), `decay_parent` (a decay dataset's parent nuclide), `exfor` (an entry compiled from a paper).

| Route | Example |
| --- | --- |
| `GET /dataset/{source}` | `/dataset/ensdf?nucid=60CO`, `/dataset/xundl?mass=60` |
| `GET /dataset/{source}/{id}` | `/dataset/ensdf/60CO:ADOPTED%20LEVELS,%20GAMMAS` |
| `GET /dataset/{source}/{id}/text` | the same dataset's cards as `text/plain` |
| `GET /dataset/{source}/{id}/md` | the same as Markdown (`text/markdown`) |
| `GET /dataset/{source}/{id}/pdf` | the same as a PDF (`application/pdf`) |
| `GET /exfor/entry/{id}` | `/exfor/entry/10001`; `/text` is its X4 text; `/md` and `/pdf` the entry as Markdown and a PDF |
| `GET /exfor/subentry/{id}/md` | `/exfor/subentry/10001002/md`; `/pdf` the same as a PDF |
| `GET /endf/material/{release}/{mat}` | `/endf/material/B-VIII.1/9228?sub=neutrons&mf=3&mt=18`; `/text` is that section as plain text; `/md` and `/pdf` the material |
| `GET /nsr/{key}/text` | `/nsr/2011CH57/text`; `/md` and `/pdf` the reference as Markdown and a PDF |

`source` is `ensdf` (2026-11-05) or `xundl` (2026-10-01). A dataset's `id` is its NUCID and DSID joined by a colon,
URL-encoded, as Search's ids are (`60CO:ADOPTED LEVELS, GAMMAS`); NUCID and DSID name one dataset in a release.

`/dataset/{source}?nucid=` or `?mass=` lists datasets as NNDC's index pages do:
`{source, release, nucid, mass, total, rows: [{id, nucid, dsid, type, date, publication, levels, gammas, cards, graph}]}`,
`type` being ENSDF's dataset type (adopted, decay, reaction, …), `date` its yyyymm.

`/dataset/{source}/{id}` returns
`{source, release, id, header, qvalue, parents, normalization, levels, gammas, other, comments, references, cards, graph}`:
- `header`: `{nucid, dsid, type, date, publication, authors, citation, cutoff, history: [{TYP, AUT, CIT, CUT, …}], dsref: [keys]}`
- `qvalue`: `{q_minus, sn, sp, qa, … each with _unc, qref}` or null; `parents` and `normalization`: their cards' fields
- `levels`: `[{seq, energy_kev, energy, unc, jpi, half_life, l, s, flag, ms, band, comments: [text]}]`; `energy` and
  `half_life` as the card writes them, `energy_kev` a number
- `gammas`: `[{level_seq, from_kev, to_kev, energy_kev, energy, unc, ri, ri_unc, mult, mr, cc, ti, flag, comments: [text]}]`;
  `from_kev` is the level the gamma leaves; `to_kev` the level it reaches where the energy difference picks one, else null
- `other`: `{betas, ec, alphas, delayed, xrefs, records}`, each a list of its cards' fields
- `comments`: the dataset's general comments `[{card_seq, type, rtype, text}]` (level and gamma comments sit on those rows)
- `references`: `[{key, reference}]`, the NSR keys the dataset cites (`nsr.ensdf_refs`, `xundl_refs`, and the header's
  DSREF) with the reference as the mass chain's references dataset writes it, else as NSR writes it
- `cards`: the dataset's lines exactly as held (`nsr.ensdf_cards`, `xundl_cards`), in order

`/text` is those cards, one per line. `/md` renders the header as a list, levels and gammas as tables, comments as quoted
blocks and the references as a list linking each key to `/nsr/{key}`. `/pdf` renders the same in the paper palette's
print form, as NNDC's "PDF Version" does (Part C; the library is named in "Packages" below). Until the page switches to it,
the page's PDF button is the browser's print of the page.

`/exfor/entry/{id}`: `{id, entry: {title, year, authors, institutes, references, date, n_subentries}, subentries:
[{subent, title, reaction, quantity, target, n_data_rows}], x4, x4_source, papers, graph}`; `papers` are the NSR keys
that cite the entry (`nsr.nsr_exfor`). `x4` is the entry's X4 text from the
X4Pro database (`nsr.exfor_x4src`, release 2023-07-14); entries compiled since then have `x4: null` and
`x4_source: null`. The subentries come from the J4 tables (2026-10-28); `/exfor/subentry/{id}` has their data.

`/endf/material/{release}/{mat}?sub=neutrons&mf=1&mt=451`: `{release, mat, sublibrary, material: {za, zsymam, awr,
temp_k, alab, edate, auth, ref, description, …}, sections: [{mf, mt, reaction, line_count}], text: {mf, mt, lines},
graph}`. `sublibrary` is the name `sub` takes (`neutrons`, `protons`, `decay`, …), not the library's folder. `sub` defaults to `neutrons`, `mf` and `mt` to 1 and 451 (the material's description); `text.lines` is that
section's lines from `nsr.endfb_records`. `/text` returns them as plain text. A whole material can run past the 6 MB a
Lambda response holds, so the text goes one section at a time.

`/nsr/{key}/text` is the reference in NSR's exchange layout (`<KEYNO   >`, `<REFRENCE>`, `<AUTHORS >`, `<TITLE   >`,
`<KEYWORDS>`, `<SELECTRS>`, `<DOI     >`), written from `search_nsr`'s fields; `/nsr/{key}` now carries `graph` too (the
paper, its nuclides and its EXFOR entries): the lake holds NSR's fields, not its
exchange files, so the `<HISTORY >` and `<CODEN   >` lines are missing.

**Markdown and PDF for EXFOR, ENDF/B and NSR** (brief 34 follow-up). `/md` on `/exfor/entry/{id}`, `/exfor/subentry/{id}`,
`/endf/material/{release}/{mat}` and `/nsr/{key}` renders the header as a list, the data as tables and the raw text in
a fenced block:
- EXFOR entry: the entry's fields, its subentries, the NSR papers that cite it, the X4 text.
- EXFOR subentry: its fields and BIB keywords, its datasets, its COMMON values, its data table, its X4 text.
- ENDF/B material: the header fields, the description, the sections, and the lines of the section that `mf` and `mt` pick.
- NSR: the fields, its nuclides and reactions, its EXFOR entries, the exchange record.

`/pdf` renders the same document in the dataset PDF's form. A PDF stops a table at 2,000 rows and the raw text at 3,000
lines and says so; the Markdown has everything. Both are cached for an hour like the other GETs.

## Saved views and files (brief 34, community.py)

Behind the app's `/api/community` and `/api/upload`. These routes are not cached: the app calls the API Gateway origin
for them, not CloudFront (which passes GET and HEAD only). A write sends `x-nsr-write-key`, the value of SSM
`/nsrgpt/devbox/nsr-api-write-key`, which the Lambda holds as `NSR_WRITE_KEY` and the app as `NSR_API_WRITE_KEY`.

| Route | Does |
| --- | --- |
| `GET /community` | every saved view and recipe, newest first: `{views: [{id, name, saved_by, created_at, kind, state}]}`; `?kind=view` or `recipe` for one kind |
| `GET /community/{id}` | `{view}` |
| `POST /community` | `{name, saved_by, state}` saves one; `kind` is recipe when the state holds a prompt step, else view; returns `{view}` |
| `DELETE /community/{id}` | removes one; `{deleted: id}` |
| `GET /files` | `{files: [{key, name, size, modified}]}` under `files/pdfs/workspace/` |
| `POST /files` | `{name, type}` returns `{key, url}`: the key `files/pdfs/workspace/<yyyy-mm>/<name>` (a number added if taken) and a PUT URL good for 10 minutes |

The store is DynamoDB `nsrgpt-views` (on demand; key `id`; index `kind-created_at`). The seeds are rows written once by
`scripts/community/seed.mjs`.

## Packages and build (brief 34)

The PDFs are written by reportlab 5.1.0 (pure Python; it brings Pillow 13.0.0 and charset-normalizer) with DejaVu Sans,
Sans Bold and Sans Mono embedded for the Greek letters and minus signs ENSDF's values carry (`fonts/`). The package went
from 38 MB zipped and 113 MB unzipped to 48 MB and 140 MB, inside Lambda's 250 MB. The parse box is gone, so `build.sh`
now runs on any Ubuntu 24.04 box, the dev box included (it makes `/opt/nsrapi` the first time):

```
aws s3 cp services/nsr-api/ s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/ --recursive --exclude '*' --include '*.py' --include '*.sh'
./scripts/iaea/box/ssm.sh i-0ec4775a5cd68d41b 'aws s3 cp s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/build.sh /tmp/ && bash /tmp/build.sh'
./services/nsr-api/deploy.sh
```

`test_dataset.py` runs the dataset routes on the box before a deploy. First responses after a cold start: a dataset 4–5 s
(the ENSDF tables load into memory), then 0.1–0.4 s; a PDF 0.5–1.5 s; an EXFOR entry with its X4 text 2–4 s.

Spend: DynamoDB on demand at $1.25 a million writes and $0.25 a million reads, storage inside the free 25 GB; the S3 PUTs and
the Lambda time are inside the free tiers. At this use, under a cent a day.
