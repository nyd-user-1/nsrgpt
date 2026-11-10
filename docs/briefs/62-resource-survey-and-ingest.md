# 62 — The resources never reached: survey every one, ingest the clear wins (2026-11-11, 06:20 ET)

You're `worker-4`, after brief 60's QA drive (its GNDS boxes keep compiling). Written by `lead-agent` (Fable) from
Brendan's list at 06:15 ET. Report to `lead-agent` by SendMessage only, in Efficiency Voice, one line per resource
decided, one report at the end. No questions mid-job; decide and record.

## Rules
1. Mac rules: nothing downloaded to the Mac; fetches run on a box (the dev box for small things, a parse box for
   anything over a few hundred MB), reached through `scripts/iaea/box/ssm.sh`. Free routes first; nothing behind a
   login; respect each site's terms and rate limits (one request a second, a plain User-Agent naming NSRgpt and
   Brendan's address only if a site asks for contact). Spend cap $5.
2. `~/Code/nsrgpt` on main, shared: pull with `--rebase --autostash`, commit with explicit paths, push right after.
   You own `scripts/ingest/**` (new), `raw/<source>/2026-11-11/**`, `INVENTORY.md` rows, and this file's Result table.
3. Copy the pattern (EV rule 17): `scripts/iaea/` (run.sh, manifest.sh, inventory.sh, spend.json) is how a source
   is mirrored with a manifest; `scripts/parse/icrp107/ingest.py` for a single download.

## Part A: the survey (two hours at most)
For every URL below, one row in the Result table of this file: what it is; API, bulk download or page only; size;
licence or terms; what we already hold that overlaps (`INVENTORY.md`); the verdict: ingest now, ingest later with
why, skip with why. Fetch only what the verdict needs (a listing, a sample record).

NNDC and IAEA-NDS: nds.iaea.org (the services index), nds.iaea.org/exfor (EXFOR web and endf.htm), the EXFOR
master (nrdc/exfor-master/entry, j4, c4, alloc; we hold the 2026-10-28 x4 master and J4; find what is newer or
missing, C4 is the computational format), x4guide/API (the EXFOR API: list its endpoints and which our routes
could use), nds.iaea.org/relnsd (the Live Chart API, NUBASE, betashape: beta spectra per transition), NuDat3 and
its guide, ensdf at nndc.bnl.gov (the ENSDF web services), nds.iaea.org/stopping (the IAEA electronic stopping
power database: ingest; brief 57 used the Bethe formula because the lake held none), nds.iaea.org/conderc/openmc
(CONDERC: OpenMC inputs of criticality and shielding benchmarks: ingest; the integral-benchmark feature for the
sweep's predictor), nds.iaea.org/records (InvenioRDM; the REST API at inveniordm.docs.cern.ch: list every record
with its DOI, files and sizes), RIPL-3 (www-nds.iaea.org/RIPL-3: level densities, discrete levels, optical
potentials, masses, gamma strengths: ingest, it is the reference input library for every model code), nds.iaea.org/cdroms
and nds.iaea.org/legacy (decades of reports and CD-ROM libraries as PDFs and archives: list every title with its
year and size; ingest the PDFs for the document library brief 59 names, worker-2's lake/documents/), the
AMDIS databases (amdis.iaea.org/databases, collisiondb, pwidb, ambdas; cascadesdb; CICLOP; the fusion data lake
pages at nucleus.iaea.org and www-nds.iaea.org/pages/fusion-data): atomic, molecular and plasma-wall data for
fusion: list and size, ingest later unless an API makes it an hour. Skip with a line: Wikipedia pages, the SCK CEN
school, Nucleonica (commercial), the MDPI issue (list its papers' DOIs for NSR cross-reference only).

## Part B: ingest the clear wins, in this order
1. IAEA stopping powers: every table, under `raw/iaea/2026-11-11/stopping/` with a manifest; a parsed Parquet
   `lake/stopping/<date>/` (projectile, target, energy, stopping power, source, year) registered as
   `nsr.stopping_powers`; tell `worker-3` in one line so the medical yields can use measured stopping powers.
2. RIPL-3: the whole library, `raw/iaea/2026-11-11/ripl-3/`, manifest; parse discrete levels and masses to
   Parquet if the formats are documented in the archive (they are); register.
3. CONDERC OpenMC benchmarks: the inputs and the reported k-eff, `raw/iaea/2026-11-11/conderc/`, a Parquet of
   (benchmark, library, k_eff, uncertainty, materials involved) if the site lists results; tell `worker-3`.
4. The records at nds.iaea.org/records: the catalog as a table (`nsr.iaea_records`: doi, title, year, files,
   bytes) and the files under 1 GB each that are not duplicates of what we hold.
5. cdroms and legacy: the PDFs and small archives, with their listing as a table; the large archives listed only.
6. Betashape spectra and NUBASE through the Live Chart API, if the API serves them in bulk; else listed.
Each with an `INVENTORY.md` row and a manifest with bytes, files, spend, the fetch date and the source's terms.

## Done means
Every URL has a Result row; the wins in Parts B.1 to B.3 are in the lake with tables; the rest ingested or listed
with why; this file's Result table committed; the box terminated; one final report with counts and spend.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/62-resource-survey-and-ingest.md and do it after the QA drive; report to lead-agent after each part.`
