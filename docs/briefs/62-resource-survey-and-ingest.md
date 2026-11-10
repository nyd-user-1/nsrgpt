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

## Result (worker-4, 2026-11-10)

Reachability on 2026-11-10 with a plain client (curl from the dev box and nsr-ingest-1, User-Agent `NSRgpt-*`): nds.iaea.org,
www-nds.iaea.org, amdis.iaea.org and www-amdis.iaea.org answer a Cloudflare challenge ("Just a moment…", 403) on nearly
every path; open were `www-nds.iaea.org/stopping/*`, the Live Chart API (`nds.iaea.org/relnsd/v1/data`), www.nndc.bnl.gov,
db-amdis.org, cascadesdb.org, the Fusion Portal on nucleus.iaea.org and the Wayback Machine. Nothing was taken past a
challenge; the earlier mirrors (raw/iaea/2026-11-07, raw/iaea-records/2026-11-08) and Wayback cover what they can.

| Resource | What it is | Access | Size | Terms | Already held | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| nds.iaea.org (services index) | IAEA-NDS home: links to every database and service | Page; challenged | — | IAEA Terms of Use | raw/iaea/2026-11-07/ (the site at its paths) | Skip: held |
| nds.iaea.org/exfor, endf.htm | EXFOR and ENDF web retrieval | Web apps; challenged | — | IAEA ToU | EXFOR as J4 2026-10-28, X4Pro 2023 and 2025, C5 2023; 13 ENDF releases | Skip: the data are held |
| EXFOR master (nrdc/exfor-master: entry, j4, c4, alloc) | The master files in X4, J4 and C4 | Bulk; challenged. GitHub copies: IAEA-NDS/exfor_master (pushed 2026-10-29), EXFOR-JSON-File and EXFOR-C4-File (2026-10-28) | 370, 397, 174 MB (repos) | IAEA | All three in raw/github (pulled 2026-11-07) and the NRDC master in raw/iaea/2026-11-07 | Nothing newer than held; C4 parse later (J4 and C5 cover its content now) |
| x4guide/API (nds.iaea.org/exfor/x4guide/API) | EXFOR web API: `x4list` (Target, Reaction, Quantity, Author1; json, xml, csv), `x4get` (DatasetID; op c4, c5, c5a, c5m, c5ma, csv, x4jsfy), `x4dat`; ENDF: `e4list`, `e4get`, `e4sig`, `e4fy`, `e4decay`; `ibandl` | GET API; challenged (guide read from Wayback) | — | IAEA ToU | The lake answers the same queries from J4, C5 and the ENDF tables | Skip: no route can call it while challenged; `x4get op=c5` is our C5 table |
| relnsd (Live Chart API), NUBASE, BetaShape | Nuclide data API: ground states (NUBASE 2020 and ENSDF), levels, gammas, decay radiation, `bin_beta` spectra | API, open | per query | IAEA ToU | raw/iaea-livechart/2026-11-06 (ground states and 8 more tables) | NUBASE: held in ground states; BetaShape: ingested (B.6) |
| NuDat3 and its guide (nndc.bnl.gov/nudat3) | NNDC's ENSDF and NuBase viewer, CSV per table | Web app | — | BNL terms | ENSDF 2026-11-05 in lake/ensdf; NNDC downloads in raw/nndc/2026-11-07 | Skip: views of data held |
| ENSDF at nndc.bnl.gov | ENSDF retrieval and archivals | Web services, bulk archivals | — | BNL | lake/ensdf/2026-11-05, raw/nndc/2026-11-07 | Skip: held |
| nds.iaea.org/stopping | Electronic stopping power of matter for ions, every measured value | Bulk zip, open; API schema challenged | 4.6 MB zip (74 MB CSV), refs 47 KB | IAEA ToU, cite the database | The same zip since 2026-11-07 (byte for byte) | Ingested (B.1) |
| nds.iaea.org/conderc/openmc | CoNDERC: OpenMC inputs and results of criticality benchmarks | Files; challenged | 5.3 MB zip, 601 files | IAEA ToU | The page (2026-11-07), not its files | Ingested from Wayback, 2026-03-01 capture (B.3) |
| nds.iaea.org/records (InvenioRDM) | Records repository: reports, presentations, data | REST API; challenged | 6,810 records, 6,208 files, 27.5 GB | IAEA | Index of all 6,810 and 5,666 files (16.3 GB) since 2026-11-08 | Catalog tables (B.4); the files Wayback holds fetched; 46 data files (4.4 GB) and 445 documents and images exist only behind the challenge: later |
| RIPL-3 (www-nds.iaea.org/RIPL-3) | Reference Input Parameter Library: masses, levels, densities, optical, gamma, fission, resonances | Files; challenged | — | IAEA | Pages and 4 small files (2026-11-07); RIPL-4, its May 2026 successor with the same segments, in raw/github | RIPL-4 levels, gammas and AME2020 masses parsed (B.2); RIPL-3's own files later (Wayback has no levels.zip) |
| nds.iaea.org/cdroms | CD-ROM libraries and packages (X4Pro, C5, EMPIRE, EPDL, IRDF…) | Catalog script and downloads; challenged | 39 files, 19.0 GB | IAEA ToU | Every listed file, plus 13 older versions (2026-11-07) | Listed (B.5) |
| nds.iaea.org/legacy | Older reports and libraries | Pages; challenged; Wayback's index was offline when asked | — | IAEA | Not held | Later: list from Wayback when its index answers |
| AMDIS databases (amdis.iaea.org/databases), ALADDIN, AMBDAS, CICLOP | Atomic, molecular and plasma data for fusion | Challenged | — | IAEA | None | Later: fusion data, not on today's path |
| CollisionDB (db-amdis.org/collisiondb) | Plasma collisional processes | Open site and per-dataset API | 122,661 datasets | IAEA ToU, CC licence page | None | Later: about 34 hours at a request a second |
| PWIDB (db-amdis.org/pwidb) | Plasma-wall interaction data | Open site | 465 PSI and 365 PMI datasets | IAEA | None | Later: fusion |
| CascadesDB (cascadesdb.org) | Molecular-dynamics damage cascades | Open; records | (not sized) | CC BY 4.0 | None | Later: materials damage |
| Fusion data pages (nucleus.iaea.org fusion portal, www-nds.iaea.org/pages/fusion-data) | Portal pages listing fusion databases | Portal open; NDS page challenged | — | IAEA | None | Later |
| Wikipedia pages | Encyclopedia | — | — | — | — | Skip (brief) |
| SCK CEN school | Course pages | — | — | — | — | Skip (brief) |
| Nucleonica | Commercial nuclear portal | — | — | Commercial | — | Skip (brief) |
| MDPI issue | Journal issue for NSR cross-reference | — | — | — | — | Not listed: the brief gives no URL |
