# Resonance reconstruction for every release (brief 74, Elpis lane B)

Every served release with File 2 resonance parameters has its MF3 cross sections reconstructed through the resonance
range in advance with PREPRO 2023 and served the way NNDC's POINT releases are: `lake/serve/endf/<release>-point-0K/`
and `<release>-point-293.6K/` (`xs/`, `xs_index/`, `xs_series/series.bin`), partitions of `nsr.endf_serve_xs`.
ENDF/B-VIII.1 and VIII.0 keep NNDC's own POINT2025 and POINT2018 files.

## Method

Per material (MF1, MF2 and MF3 of `lake/endfb/<release>/records/`, as `scripts/jobs/box/broaden.py` writes a tape):
PREPRO 2023 (IAEA-NDS/PREPRO at cc5fd087, the lake's copy; linear, recent and sigma1 built at -O2) with the cards
broaden.py uses:

- `linear`: MF3 to linear-linear within 0.1%.
- `recent`: the resolved and unresolved resonance contributions from MF2 added to MF3 within 0.1% (the unresolved range
  as infinitely dilute averages). Its output is the 0 K curve.
- `sigma1`: Doppler broadening to 293.6 K, thinned within 0.1%; the unresolved range is copied unbroadened (PREPRO's
  default). Its output is the 293.6 K curve.

## Steps (on a recon box)

Boxes: `./scripts/parse/box/create.sh nsr-recon-<n> m7i-flex.large ../../recon/userdata.sh 60` (role nsr-parse-box;
the box terminates itself after 8 hours). Scripts are read from `lake/_work/parse/endfb/recon/` at boot:
`aws s3 sync scripts/recon/ s3://nsr-lake-613473203863/lake/_work/parse/endfb/recon/ --exclude "*" --include "*.py"`,
plus `serve.py`, `lake.py` and `ddl/` from `scripts/parse/`.

| Step | Line | Writes |
| --- | --- | --- |
| List | `recon.py list <release>…` | `lake/endfb/<release>/recon/materials.json`: the materials with an LRU 1 or 2 range in `endfb_res_ranges`, heaviest first |
| Tapes | `recon.py tapes <release>…` | `recon/tapes/<id>.endf.gz`, one a material, from one pass over the release's records |
| Run | `recon.py run --jobs 2 <release>…` | `recon/out/<id>.parquet` (every MF3 section at 0K and 293.6K), `recon/status/<id>.json` (timings or the error) |
| Serve | `recon.py serve <release>…` | `lake/serve/endf/<release>-point-{0K,293.6K}/`, the `endf_serve_xs` partitions, `recon/manifest.json` |
| Check | `recon.py check <release>…` | prints listed, tapes, done, failed, served |

`run` takes materials from a shared queue: each is claimed with an S3 conditional write (`recon/claim/<id>`, `If-None-Match: *`),
so any number of boxes can run the same line at once. A material with a status object is done; a rerun does the rest;
`--stale <s>` takes over claims older than s seconds that never got a status. The id is crc32 of
`<sublibrary>/<file_name>` and the MAT.

## JANIS's own numbers (B1)

`janis_tabler.py "<JANIS library>|<nuclide>|<MT>"…` reads JANIS Web's Tabler (its "original values") at one request a
second: the home page for the session cookie, `/janisweb/renderer?root=~N~<lib>~SIG~<nuc>~MT<mt>` (redirects to
`/janisweb/renderer/<id>`), `/janisweb/renderer/<id>/toogleProducer.json` with `producerId=janis-render-T-<root>~xs`
(opens the table, names its viewer), then `/janisweb/renderer/<id>/tabler/<viewer>?pg=<n>`, 500 rows a page (energy in
eV, cross section in barns, 7 significant digits). Pages and values go to `lake/_work/parse/endfb/recon/janis/`.
`b1.py` compares them with `recon/out/` (and NNDC POINT where held) and writes `lake/_work/parse/endfb/recon/b1.json`.
