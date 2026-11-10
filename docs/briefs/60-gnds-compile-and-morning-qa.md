# 60 — The compiler: every ENDF-6 release in the lake as GNDS 2.0, served; then the morning QA drive (2026-11-10, overnight before launch)

You're `worker-4`. Written by `lead-agent` (Fable); Brendan asked at 03:50 ET whether nuclear data has the need
govblock's USLM compiler meets. It does: ENDF-6 is the fixed-column 1966 format; GNDS 2.0 (Generalised Nuclear
Database Structure, WPEC SG38 and SG43, the NEA and IAEA standard, XML and HDF5) is its USLM, and ENDF/B-VIII.1 is
the first release NNDC also ships as GNDS. Nobody serves the older releases, JEFF, JENDL, TENDL or CENDL as GNDS.
The lake holds all 13 as ENDF-6 text (`lake/endfb/<release>/records/`, the materials' lines, brief 15 and 43). The
compiler is LLNL's FUDGE (github.com/LLNL/fudge, its `endfFileToGNDS` and `bin/endf2gnds.py`), open source; copy
it, don't write a converter. Report to `lead-agent` by SendMessage only, in Efficiency Voice
(`docs/sketches/2026-11-06-efficiency-voice.html`), one line per part, one report at the end. No questions mid-job.

## Rules
1. Mac rules (8 GB Air): no `python3` locally, the AWS CLI one call at a time, nothing heavy downloaded. Everything
   runs on a box (below) reached only through `scripts/iaea/box/ssm.sh`; scripts reach it through S3
   (`lake/_work/gnds/`), never pasted into SSM.
2. `~/Code/nsrgpt` on main, shared with `worker-1`, `worker-2`, `worker-3`: `git pull --rebase --autostash origin
   main`, commit in one step with explicit paths, push right after. Never `git add -A`. You own `scripts/gnds/**`
   (new), `services/nsr-api/gnds.py` (new; its README rows and its `MODULES` line only), `lake/gnds/**`,
   `lake/_work/gnds/**`, `nsr.gnds_*`. Nothing in `app/`, `components/`, `lib/`, `scripts/parse/`, `scripts/sweep/`.
3. Copy the pattern, then adapt (EV rule 17): `scripts/jobs/box/create.sh` and `userdata.sh` for the box;
   `scripts/jobs/box/broaden.py`'s `tape()` for writing one material's ENDF text from `endfb_records`;
   `services/nsr-api/structure.py`'s `route` for the route; `scripts/parse/box/lake.py` for Parquet to the lake and
   Glue registration.
4. Box `nsr-gnds-1`: `c7i.4xlarge` (16 vCPU, about $0.71 an hour), 200 GB gp3, role `nsr-jobs-box` with `lake/gnds/*`
   and `lake/_work/gnds/*` write added. Spend cap $10 for the night; name a paid step and its price before taking it.
   Terminate at the end.
5. Nothing is rounded up: the catalog records every conversion that failed with FUDGE's last lines, and the report
   gives converted and failed per release.

## Part A: FUDGE on the box
1. Fetch FUDGE's source into the lake first (`raw/github/2026-11-10/LLNL/fudge/`, the release archive and its
   version and commit recorded in a `manifest.json`), then install on the box from the lake's copy into a venv
   (numpy and a C compiler are its needs; the README says `pip install .`). Record the version.
2. Convert one material by hand: U-235 from B-VIII.1 neutrons (MAT 9228) written as a tape from `endfb_records`
   (the way `broaden.py` does; the whole material, every MF), `endf2gnds` to `reactionSuite` and `covarianceSuite`
   XML, GNDS format version 2.0. Check the XML parses, holds `<reactionSuite` with `format="2.0"`, and that the
   fission cross section at 1 MeV read back through FUDGE equals the ENDF-6 value in `endfb_xs_points` within
   1e-6. Report the time per material.

## Part B: every release
1. `scripts/gnds/compile.py <release> [<sublibrary>]`: every material of the release (from `endfb_materials`), 16 at
   a time, each written as a tape, converted, saved gzip-compressed to `lake/gnds/<release>/<sublibrary>/<mat>.xml.gz`
   (and `<mat>.cov.xml.gz` where a covarianceSuite comes out), with a row in `lake/gnds/<release>/catalog/` →
   `nsr.gnds_files` (release, sublibrary, mat, za, name, key, cov_key, bytes, fudge_version, gnds_version, seconds,
   ok, error). A failure is recorded with FUDGE's last 20 lines, never retried silently.
2. Order: B-VIII.1 neutrons (report its numbers: materials, converted, failed, bytes, minutes), then the rest of
   B-VIII.1's sublibraries, B-VIII.0, B-VII.1, JEFF-3.3, JENDL-5, CENDL-3.2, TENDL-2023 (the biggest; neutrons first),
   then B-VII.0 and older (expect more failures on the old formats; record them). Stop when the cap nears and say
   where you stopped.
3. `lake/gnds/manifest.json`: per release and sublibrary, materials, converted, failed (with the error classes and
   their counts), bytes, minutes, spend; FUDGE's version; the rerun line. `INVENTORY.md` (the S3 object at the
   bucket root: download, edit, upload) rows for `lake/gnds/`.

## Part C: served
1. `services/nsr-api/gnds.py` (`MODULES` gets `"/gnds": "gnds"`): `GET /gnds?release=B-VIII.1&name=U-235&sub=neutrons`
   → `{ release, sublibrary, mat, za, name, url, cov_url, bytes, fudge_version, gnds_version }` with `url` the
   CloudFront address of the object (the distribution already fronts the lake's served prefixes; check
   `services/nsr-api/README.md` and `community.py`'s file links for how an object URL is formed; if `lake/gnds/` is
   not behind it, add the path pattern the way the others are and say so). `GET /gnds/releases` → the manifest's
   per-release counts. README rows with example URLs. Build and deploy from the dev box (`services/nsr-api/README.md`,
   "Packages and build"; `worker-1` deploys too: pull before building so you ship their routes with yours, and tell
   them when you deploy).
2. Report what the UI needs (for `worker-2` or the morning): a "GNDS 2.0" download beside "Text" on the ENDF record
   page (`/datasets/endf/...`), and a line on the lake page.

## Part D: the morning QA drive (start at 06:15 ET whatever Part B has reached; the box can keep converting)
1. Read `docs/briefs/59-morning-report-2026-11-11.md` (the workers append their URLs through the night) and brief 55.
2. On the dev box with Playwright at `/opt/shot` (the lead's `shot.sh` pattern: console errors, page errors, failed
   requests, a screenshot), load every URL the report names, on production (https://nsrgpt.brendan-stanton.workers.dev)
   and on the box, both themes: /, /nsrcpt, /about, /sweep, /sweep/medical and one route page, /sweep/icrp if there,
   /lab, /graph, /viz/chart, /viz/structure, /viz/matrix, /viz/decay, /chat, /datasets/endf, one ENDF record, one
   EXFOR record, /pipeline, /data-dictionary, the sign-in page. For each: rendered yes/no, the first console or page
   error if any, the time to the first paint of its data, the screenshot's lake key (`lake/_work/qa/2026-11-11/`).
3. Append a "QA drive" table to brief 59 with those rows, commit and push, and report the failures to `lead-agent` in
   one line each with the page and the error. Fix nothing in the UI yourself; name the owner.

## Done means
FUDGE in the lake and on the box with its version; B-VIII.1 and as many releases as the cap allows as GNDS 2.0 in
`lake/gnds/` with the catalog and manifest; `/gnds` live with README rows; the QA table in brief 59; the box
terminated; one final report to `lead-agent` with the per-release counts, the URL of one GNDS file, spend, and the
QA failures.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/60-gnds-compile-and-morning-qa.md and do it; report to lead-agent after each part.`
