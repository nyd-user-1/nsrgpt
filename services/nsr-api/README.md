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
| `sweep.py` | `/sweep`, `/sweep/*` (the sweep, retrodiction, flags, medical routes) | worker-3 (brief 57) |
| `build.sh` | builds the package on a parse box (every `*.py` here, DuckDB, the httpfs and fts extensions) and puts it in S3 | |
| `deploy.sh` | creates or updates the Lambda, the HTTP API and CloudFront from the package in S3 | |
| `test_box.py` | runs the handler on a parse box before deploying | |
| `test_structure.py` | runs structure.py's routes on a parse box before deploying | parsing-1 (brief 17) |
| `resonances.py` | `/endf/resonances`, `/endf/resonances/cov`; `/endf/cov`'s `resolved` band | worker-1 (brief 56) |
| `library.py` | `/endf/fy`, `/endf/decay`, `/endf/decay-vs-ensdf` | worker-1 (brief 56) |
| `icrp.py` | `/icrp/nuclide/{name}`, `/icrp/radiations/{name}`, `/icrp/chain/{name}`, `/icrp/vs-ensdf` | worker-1 (brief 56) |
| `counts.py` | `/counts` | worker-1 (brief 56) |
| `test_layers.py` | runs brief 56's routes on a box before deploying | worker-1 (brief 56) |

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
| `GET /exfor/points` | `/exfor/points?target=U-235&reaction=N,F&quantity=SIG&emin=9e3&emax=1.8e4&limit=20000` (brief 51) |

`/exfor/search` fields: `target`, `reaction`, `quantity`, `product`, `author`, `institute`, `acc`, `year`, `energy` (or
`emin`, `emax`), in eV; `sort` = `reaction`, `year` or `acc`; 100 rows a page. Syntax as on nds.iaea.org/exfor: `;` for
alternatives, a leading `^` excludes, `*` is a wildcard, `a..b` is a range.

`/exfor/points` takes the same fields and returns every data point of every matching dataset (at most 2,000 datasets):
`{datasets: [{dataset_id, subentry, entry, author, year, institute, reaction, quantity, units, n}], points: [{dataset_id,
e_ev, de_ev, xs_b, dxs_b}], total, limit, truncated, source}`, points sorted by dataset then energy, energies in eV and
values in the dataset's base unit (`units`; barns for SIG); `emin`/`emax` also cut the points; `limit` defaults to
20,000, at most 50,000. Read from `nsr.exfor_serve_points` (`lake/serve/exfor/2026-10-28/points/target_z=<Z>/`, built by
`scripts/parse/serve/points.py`: C5 values where C5 holds the dataset, else J4 converted with the dictionary's unit
factors; 17.8 M points, 153,664 datasets). Datasets whose reaction code combines reactions (ratios such as
(U-235(N,F),,SIG)/(LI-6(N,T),,SIG), sums, products) match the search fields but have no points: their values are not the
reaction's cross section, and the dataset entry says so in `excluded`. The U-235 (n,f) 9–18 keV example (78 datasets, 4,156
points) answers in 0.3–0.7 s warm, 5 s cold.

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
| `GET /endf/xs` | `/endf/xs?name=U-235&mt=18`, `&compare=B-VIII.0,B-VII.1`, `&temp=293.6K`, `&point=0`, `&sub=protons`, `&emin=9e3&emax=1.8e4` |
| `GET /endf/cov` | `/endf/cov?name=U-235&mt=18&release=B-VIII.1,JEFF-3.3,JENDL-5&emin=9e3&emax=1.8e4` (brief 51) |
| `GET /endf/mt` | `/endf/mt` |

`/nuclide/{name}` returns the nuclide (Z, N, half-life in seconds and as written, decay modes with percentages, ground-state
J-pi, adopted Q-values, counts), its adopted levels and gammas (each gamma with the level it leaves and, where the energy
difference picks one level, the level it reaches), and its decays as parent and as daughter. `/levels` and `/gammas` page
by 500.

`/endf/xs` returns one series per release: `energy_ev` and `xs_barn` arrays with the section's interpolation, Q-values
and point counts. Defaults: release `B-VIII.1`, sublibrary `neutrons`, `temp=0K`. Where NNDC's reconstructed POINT
library holds the section (B-VIII.1 and B-VIII.0, at 0K, 293.6K, 600K, 900K, 1200K, 1500K or 1800K; the five above
293.6K since brief 56) it is served instead of the bare MF3, because inside a
resonance range MF3 holds only the background; `release_served` names the release that answered, and `point=0` asks for
the MF3 itself. POINT series over 40,000 points are thinned for charting to the lowest and highest point in each of
20,000 log-energy steps (`thinned`, `n_points`, `n_served`); every point is in `nsr.endfb_xs_points`. A release the lake
does not hold comes back with `held: false` (JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 are held since brief 43).
`&emin=&emax=` (eV) cut each series to the window plus the point on each side, renumber `interp_nbt`, and add
`n_window` and `window`: U-235 MT18 in three releases at 9–18 keV is 3.3 KB instead of 253 KB, 0.22–0.30 s warm.

`/endf/cov` returns the MF33 self-covariance (MT with itself) per release as relative standard deviation per energy group:
`{name, mt, sublibrary, units, series: [{release, held, mat, mt, lb: [...], groups: [{e_lo_ev, e_hi_ev, rel_sd}], note?}]}`,
read from `lake/endfb/<release>/cov/` (`nsr.endfb_cov`, brief 43). Each NI sub-subsection adds its variance to its own
group (LB=1 and 8: F_k; LB=2: F_k squared; LB=5 and 6: the diagonal F_kk); `rel_sd` is the square root of the sum on the
union of the blocks' grids, a fraction. LB=0 (absolute), 3, 4 and 9 are left out with a note; a release with no MF33
for the section, or a lumped one (MTL), answers `groups: []` with a note. `release` is comma-separated. 0.25 s warm.

For MT 2, 18 and 102 each series also carries `resolved` (brief 56; `&resolved=0` leaves it out), the File 32 band inside
the resolved ranges, where MF33 is often empty: `{method: "mf32-diagonal-first-order", mt, groups: [{e_lo_ev, e_hi_ev,
rel_sd, rel_sd_uncorrelated, n_resonances, rel_sd_median}], ranges, note}`. Each resonance's cross section at its peak
(Breit-Wigner: capture Gn·Gg/G², fission Gn·Gf/G², elastic Gn²/G², over Er) takes the parameters' standard deviations
from the diagonal of MF32, first order, no correlations; per decade, `rel_sd` is their mean weighted by the resonances'
areas (the bound for resonances fully correlated with each other) and `rel_sd_uncorrelated` their sum in quadrature over
the summed areas (independent resonances). LRF 4 and 7 ranges are not converted (noted). Pu-240 MT102 B-VIII.1: 0.5 s.

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

## Resonances, fission yields, decay data, ICRP 107 and counts (brief 56)

| Route | Example |
| --- | --- |
| `GET /endf/resonances` | `/endf/resonances?name=U-235&release=B-VIII.1`; `&range=1` one range; `&sub=` |
| `GET /endf/resonances/cov` | `/endf/resonances/cov?name=Pu-240&release=B-VIII.1`; `&matrix=1` the correlation triples; `&range=` |
| `GET /endf/fy` | `/endf/fy?name=U-235&release=B-VIII.1&mt=454&energy_ev=0.0253`; `mt=459` cumulative; `&sub=sfy` |
| `GET /endf/decay` | `/endf/decay?name=Co-60&release=B-VIII.1` |
| `GET /endf/decay-vs-ensdf` | `/endf/decay-vs-ensdf?release=B-VIII.1&sort=sigmas`; `sort=rel_diff`; `&note=differ by more than 3 sigma` |
| `GET /icrp/nuclide/{name}` | `/icrp/nuclide/Ac-225` (also `ac225`, `225Ac`, `Tc-99m`) |
| `GET /icrp/radiations/{name}` | `/icrp/radiations/Ac-225`; `&type=A,G,X,B-` |
| `GET /icrp/chain/{name}` | `/icrp/chain/U-238` |
| `GET /icrp/vs-ensdf` | `/icrp/vs-ensdf?sort=sigmas`; `sort=rel_diff`; `&note=`; `&isomer=m` |
| `GET /counts` | `/counts` |

`/endf/resonances` reads File 2 MT151 from `lake/endfb/<release>/res_ranges/` and `res_params/` (`nsr.endfb_res_*`,
`scripts/parse/endfb/parse.py --mf=2,32`): `{name, release, sublibrary, mat, ranges: [{range_index, el_ev, eh_ev, lru, lrf,
formalism, spi, ap, n_resonances, …}], resonances: [{range_index, l, j, er_ev, gn_ev, gg_ev, gf_ev, …}], unresolved: [{l, j,
es_ev, d_ev, amun, gn0_ev, gg_ev, gf_ev, gx_ev, …}], truncated}`, at most 5,000 resolved resonances. Reich-Moore's `gf_ev` is
|GFA| + |GFB| with both kept; R-matrix limited (LRF 7) rows carry every channel's width (`widths`) and gn, gg and gf summed
over the channels by their particle pair's MT. U-235 B-VIII.1 (3,194 resonances, 84 unresolved rows, 522 KB): 0.9 s warm
at the origin, 4.1 s on a cold container.

`/endf/resonances/cov` reads File 32 from `res_cov/`: per range its LCOMP and header, every parameter's value and
standard deviation (`uncertainties`, at most 20,000), and with `&matrix=1` the off-diagonal correlations as
`[range_index, i, j, corr]` (LCOMP 2 as stored with NDIGIT digits; LCOMP 0 and 1 divided by the two standard deviations;
at most 200,000). Pu-240 B-VIII.1: 0.9 s.

`/endf/fy` (`fy/`, nfy or sfy) answers `{energies, energy_ev, products: [{zafp, fps, product, yield, yield_unc}], sum_yield}`
at the energy nearest `energy_ev` (the first when not given), 0.4 s. `/endf/decay` (`decay/`, `decay_modes/`,
`decay_lines/`) answers `{decay, modes, lines}` (at most 5,000 lines), 0.6 s. `/endf/decay-vs-ensdf` reads
`nsr.endf_decay_vs_ensdf` (`lake/endfb/_compare/decay_vs_ensdf/`, built by `scripts/sweep/endf-decay-vs-ensdf.sql`):
`{rows, counts_by_release_and_note}`, at most 5,000 rows.

The ICRP routes read brief 48's tables under `lake/icrp107/2008/` (loaded into memory on first use): `/icrp/nuclide` the
nuclide row and its daughters; `/icrp/radiations` every emission (type, yield per transformation, energy in MeV);
`/icrp/chain` the members from the head to the stable ends with each one's probability of being reached (the branching
fractions multiplied along every path and added) and every link; `/icrp/vs-ensdf` `{rows, counts_by_note}` from
`nsr.icrp107_vs_ensdf` (1,246 rows). 0.1–0.4 s; `vs-ensdf` 674 KB, 2.4 s.

`/counts` counts rows from the Parquet footers (NSR papers, ENSDF datasets and nuclides, XUNDL datasets, EXFOR entries,
subentries, datasets and data points, ICRP nuclides, links and chains) and reads each ENDF release's manifest (materials,
sections, MF3 points, resonance rows): `{counts, about, endf: {<release>: {materials, sections, points, resonances}},
endf_total, counted_at}`, kept in memory for an hour. 2.4 s when counted, then instant.

The card's `/nuclide/{name}` also answers `fy_releases` and `decay_releases` (the releases whose nfy or decay sublibrary
holds the nuclide) and `icrp` (true when ICRP 107 lists it).

## GNDS 2.0 (brief 60, gnds.py)

| Route | Example |
| --- | --- |
| `GET /gnds` | `/gnds?release=B-VIII.1&name=U-235&sub=neutrons` (also `name=u235`, `mat=9228`; `sub` defaults to `neutrons`) |
| `GET /gnds/releases` | `/gnds/releases` |

`/gnds` answers the precompiled file: `{release, sublibrary, mat, za, name, url, cov_url, bytes, cov_bytes, fudge_version,
gnds_version}`. `url` is the reactionSuite and `cov_url` the covarianceSuite (null when the evaluation has none), both
gzip-compressed GNDS 2.0 XML served by CloudFront under `/lake/gnds/` (`scripts/gnds/cdn.sh` added the bucket as the
distribution's second origin, with `/lake/gnds/*` and `/lake/jobs/*`). A material not precompiled answers 404
`{error, job}`, `job` being the `POST /jobs` body (`{kind: "gnds", params}`, services/nsr-jobs) that compiles it on demand.
`/gnds/releases` answers the manifest's counts per release and sublibrary (materials, converted, failed, bytes).

The files come from `scripts/gnds/compile.py` (LLNL FUDGE 6.14.0, `brownies/bin/endf2gnds.py --continuumSpectraFix
--formatVersion 2.0`), catalogued in `nsr.gnds_files`. The route reads `lake/gnds/<release>/index.json` and
`lake/gnds/manifest.json` through the CDN (both uploaded with `max-age=300`, kept five minutes in the container too), so
the Lambda needs no `lake/gnds/` grant.

## Stopping powers, RIPL-4, BetaShape and benchmarks (brief 62, refdata.py)

| Route | Example |
| --- | --- |
| `GET /stopping` | `/stopping?projectile=p&target=Mo&emin=0.1&emax=10`; `projectile=a&target=Au`; `projectile=O&a=16&target=C`; `projectile=p` (the targets) |
| `GET /ripl/levels` | `/ripl/levels?name=Co-60` |
| `GET /ripl/masses` | `/ripl/masses?name=Co-60`; `name=Co` |
| `GET /betashape` | `/betashape?name=Sb-131`; `name=Cs-137&mode=bm&level=0` |
| `GET /benchmarks` | `/benchmarks`; `?benchmark=hmf001&library=jendl5` |

`/stopping` reads `nsr.stopping_powers` and `nsr.stopping_refs` (`lake/stopping/2026-11-11/`, the IAEA database): `{projectile, a, target,
points: [{energy_mev_u, energy, energy_unit, stopping_power_converted, stopping_power, stopping_unit, percentage_error,
phase, ion_isotope, ref_id, year}], truncated, refs}`, at most 20,000 points; `energy_mev_u` is every energy in MeV per
nucleon (keV and per-ion energies divided out) and `emin`/`emax` filter it; `stopping_power_converted` is MeV/(mg/cm2).
Without `target`: `{targets: [{target_name, points, emin_mev_u, emax_mev_u}]}`. `/ripl/levels` reads RIPL-4's levels
segment (`lake/ripl/ripl-4-2026-05/`): `{nuclide: {z, a, symb, n_levels, n_gammas, n_max, n_c, sn_mev, sp_mev}, levels,
gammas}`; `/ripl/masses` AME2020 (`{masses: [{z, a, symbol, flag, mass_excess_mev, err_mev}]}`). `/betashape` reads
`nsr.iaea_betashape_spectra` (`lake/iaea-betashape/2026-11-11/`): `{nuclide, spectra: [{mode, parent_level_kev, daughter,
e_kev, dn_de, unc_dn_de, dn_de_nu, unc_dn_de_nu}]}`. `/benchmarks` reads `nsr.conderc_openmc`: `{benchmarks: [{benchmark,
case, runs: [{library, k_eff, k_eff_unc, k_collision, k_tracklength, k_absorption, leakage, nuclides, run_at}]}],
libraries}`. The tables load into memory on first use. The Lambda reads these prefixes through inline policy
`nsr-api-refdata` (`scripts/ingest/api-policy.sh`), which `deploy.sh` leaves in place. On the dev box with a warm container:
0.1–0.5 s the first call to a table, then 1–50 ms.

## Saved views and files (brief 34, community.py)

Behind the app's `/api/community` and `/api/upload`. These routes are not cached: the app calls the API Gateway origin
for them, not CloudFront (which passes GET and HEAD only). A write sends `x-nsr-write-key`, the value of SSM
`/nsrgpt/devbox/nsr-api-write-key`, which the Lambda holds as `NSR_WRITE_KEY` and the app as `NSR_API_WRITE_KEY`.

| Route | Does |
| --- | --- |
| `GET /community` | every saved view and recipe, newest first: `{views: [{id, name, saved_by, created_at, kind, state}]}`; `?kind=view`, `recipe` or `lab` for one kind (Lab canvases, brief 52, only with `kind=lab`) |
| `GET /community/{id}` | `{view}` |
| `POST /community` | `{name, saved_by, state}` saves one; `kind` is lab when `state.kind` is `lab`, recipe when the state holds a prompt step, else view; returns `{view}` |
| `DELETE /community/{id}` | removes one; `{deleted: id}` |
| `GET /files` | `{files: [{key, name, size, modified}]}` under `files/pdfs/workspace/` |
| `POST /files` | `{name, type}` returns `{key, url}`: the key `files/pdfs/workspace/<yyyy-mm>/<name>` (a number added if taken) and a PUT URL good for 10 minutes |

The store is DynamoDB `nsrgpt-views` (on demand; key `id`; index `kind-created_at`). The seeds are rows written once by
`scripts/community/seed.mjs`.

## The sweep (brief 57, sweep.py)

Every measured cross section in EXFOR against six evaluations (ENDF/B-VIII.1 and VIII.0 from the POINT 293.6 K releases
for neutrons, JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2), ranked; the method is in `scripts/sweep/README.md` and
`lake/sweep/2026-11-10/manifest.json`. Tables load into memory from `lake/sweep/2026-11-10/<table>/` on first use. The
Lambda reads `lake/sweep/*` through the inline policy `nsr-api-sweep` (`sweep-policy.json`, put on the role `nsr-api-lambda`).

| Route | Example |
| --- | --- |
| `GET /sweep` | `/sweep?release=B-VIII.1` (the ranked list: pairs with ≥ 2 datasets and ≥ 20 points without the driver, by z); `&sort=z\|mean\|support\|bin&dir=desc&nuclide=U-235&mt=18&sub=neutrons&min_datasets=2&page=1`; `&all=1` every pair; `&single=1` the pairs one dataset drives |
| `GET /sweep/pair` | `/sweep/pair?target=U-235&mt=18&sub=neutrons&release=B-VIII.1,JEFF-3.3` (bins and datasets per release) |
| `GET /sweep/releases` | the releases, sublibraries and counts, the run date, the method, the U-235 check |
| `GET /sweep/retrodiction` | `{summary, rows}`: the VIII.0 ranking against what VIII.1 changed, 500 rows |
| `GET /sweep/flags` | `{evaluation, exfor}`; `?kind=exfor&rule=b` (rules a: not barns, b: factor 10 or 1000 off, c: energies a decade outside every evaluation) |
| `GET /sweep/medical` | the medical-isotope production routes, a yield per evaluation and a verdict each |
| `GET /sweep/medical/{route}` | `/sweep/medical/mo99-u235-nf`: the route, its points by source (EXFOR, each evaluation, IAEA) |

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
