# 70 — Every library JANIS lists that the lake lacks: acquire, parse, serve, flip the marks (2026-11-11, 02:50 ET)

You're the worker Brendan pasted this into; call yourself `elpis-fill` in reports. Written by `lead-agent` (Fable).
Brendan's order: the Elpis pages (brief 67, renamed by brief 69 tonight) show "something north of 69" datasets
marked ❌ that JANIS Web holds and the lake does not, and "any row JANIS has, we have" by morning. He expects most
to be earlier versions of families already held, "a matter of filling in a slice here or removing a slice there".
Report to `lead-agent` by SendMessage, Efficiency Voice: one line per library as it lands (name, bytes, files,
tables, minutes, spend), one at the end. No questions: decide, record the decision in the README, go.

## Rules
Mac rules: nothing heavy on the Mac (8 GB Air; no python3; AWS CLI one call at a time). Downloads and parsing run
on a box and on Lambda. New account (profile `nysgpt-new`, bucket `nsr-lake-613473203863`, us-east-2) launches Free
Tier instance types only (m7i-flex.large, t3.micro work; larger types fail): for downloads use a m7i-flex.large
with a 200 GB gp3 volume or stream straight to S3 with `aws s3 cp - ` so disk never fills. Parsing is the Lambda
fan-out `nsr-endf-parse` (brief 64; reserve 300 of the 400 concurrency for a run and release it after, or nsr-api
is capped). The one cost rule from memory: state the free route and its time before any paid move; Lambda parsing
runs about $5.5 per billion lines. `~/Code/nsrgpt` on main is shared with `elpis-wire` (the pages) and
`elpis-check` (the checker): pull --rebase --autostash before each commit, explicit paths, push only your files
(`scripts/parse/**`, `scripts/janis/**`, `public/janis-tree*`, `lib/janis-tree.ts`'s HELD set, your README and
INVENTORY rows). Never print a secret value; name the SSM parameter. Keep `ddl/` out of mid-run `aws s3 sync`
(memory pitfall: the box appends partition lines there).

## The gap list (from `lib/janis-tree.ts`'s tree and the crawl `lake/janis/2026-11-10/tree.json`)
Distinct library names JANIS lists that the lake lacks, grouped by where they live. Confirm each against the crawl
file before fetching (the crawl is the truth for what JANIS shows; the hand tree is a copy).

**IAEA NDS, ENDF-6 format, the existing parser applies** (`https://www-nds.iaea.org/public/download-endf/` and the
library pages beneath `www-nds.iaea.org`; the hosts answer a Cloudflare challenge to plain clients: fetch from the
box with a real browser user agent and, if challenged, through the NNDC mirror `https://www.nndc.bnl.gov/endf-
releases/` for ENDF/B, the NEA JEFF pages, JAEA for JENDL, PSI for TENDL; Wayback at one request a second; never
hammer, one stream at a time):
- BROND-2.2, BROND-3.1 (IPPE; on IAEA download-endf)
- CENDL-2.1, CENDL-3.1 (CNDC; IAEA)
- ENDF/B-VI.8-HE (the high-energy sublibrary of VI.8; IAEA/NNDC)
- FENDL-2.1, FENDL-3.1b (`www-nds.iaea.org/fendl/`); FENDL-2.1 MG is multigroup (GENDF/MATXS), see below
- IRDF-2002 and IRDF-2002 MG, IRDFF-1.0, IRDFF-1.0-640g (multigroup), IRDFF-1.05, IRDFF-II (`www-nds.iaea.org/IRDFF/`)
- EAF-2007, EAF-2010 (activation files, ENDF-6 MF3/MF10 style; IAEA/UKAEA)
- RUSFOND-2010 (IPPE; IAEA)
- PADF-2007 (proton activation; JAEA/IAEA)
- IAEA/PD-2019 (photonuclear; `www-nds.iaea.org/photonuclear/`)
- JENDL-3.3, JENDL-4.0, JENDL-4.0u, JENDL-4.0/HE, JENDL/HE-2007, JENDL/AC-2008, JENDL/AD-2017, JENDL/AN-2005,
  JENDL/DEU-2020, JENDL/PD-2004, JENDL/PD-2016, JENDL/PD-2016.1, JENDL/FPY-2011, JENDL/FPD-2000, JENDL/FPD-2011,
  JENDL/DDF-2015 (`wwwndc.jaea.go.jp/jendl/`)
- JEF-2.2, JEFF-3.0, JEFF-3.0/A, JEFF-3.1, JEFF-3.1.1, JEFF-3.1.2, JEFF-3.2, JEFF-4.0 (`www.oecd-nea.org/dbdata/jeff/`;
  JEFF-4.0 is the 2025 release, the single most valuable item on this list; NEA's content page also challenges, the
  file links usually do not)
- TENDL-2009, 2010, 2011, 2012, 2013, 2014, 2015, 2017, 2019 (`tendl.web.psi.ch/tendl_<year>/`, per-projectile
  tarballs; large, 10–40 GB each: fetch neutrons, protons, deuterons, tritons, helium3, alphas, gammas; stream to S3)
- GEFY-3.3, 4.2, 5.2, 6.1, 6.2, 8.1, 9.1 (GEF fission yields in ENDF-6 MF8; `www.khschmidts-nuclear-web.eu/GEFY.html`)
- TSL ENDF/B-VI.8, TSL ENDF/B-VII.0, TSL JEFF-3.0, TSL JEFF-3.1 (thermal scattering, MF7: the `thermal_scatt`
  sublibraries of releases we hold or fetch; JANIS lists them as separate libraries, so the marks need a row each)

**Other formats** (hold the files in the lake and catalogue them tonight; parse if time allows; the mark rule below
counts a catalogued library as held with a `format` note, never as parsed):
- Nubase 1997, 2003, 2012, 2016 (AMDC text tables; `www-nds.iaea.org/amdc/` or the AMDC mirror at
  `amdc.impcas.ac.cn`; the 2020 table is held through the Live Chart)
- FENDL-2.1 MG, IRDF-2002 MG, IRDFF-1.0-640g (multigroup GENDF/MATXS)

**Bases with no library** (Heavy particles, Incident antiprotons, kaons ±, pions ±, electrons' EXFOR): these are
EXFOR-only in JANIS. EXFOR is held in full (every quantity, X4Pro), so the marks should already be "same" unless
the crawl says otherwise; check the crawl's `rule` for those bases and fix `mark.py` if it marks them missing
for want of a projectile map.

## The pipeline (reuse, do not rebuild)
1. **Fetch** to `lake/_raw/<library>/<as-downloaded>` with a `SOURCE.md` (URL, date, bytes, checksum, licence line).
2. **Lay out** as `lake/endfb/<release>/<sublibrary>/` the way the 13 held releases are (the README names the tokens:
   `neutrons`, `thermal_scatt`, `decay`, `nfy`, `sfy`, `gammas`, `protons`, `deuterons`, `tritons`, `helium3s`,
   `alphas`, `photoat`, `electrons`, `atomic_relax`). Release names as JANIS prints them, slashes to hyphens as the
   lake already does (`B-VIII.0`, `JEFF-3.3`): so `JENDL-4.0u`, `JENDL-HE-2007`, `TENDL-2015`, `GEFY-9.1`,
   `TSL-B-VI.8`, `IRDFF-II`.
3. **Parse** with the rerun lines in `scripts/parse/endfb/README.md`: Part A (materials, sections, xs_points, records)
   on the parse box (`scripts/parse/box/create.sh`), Files 2/32/33 and MF8 by their parts, Files 4–15 by the Lambda
   fan-out (`nsr-endf-parse` jobs split / parse / fanout / collect / values / clean; the README has the lines). One
   `manifest.json` per release with counts and spend, as the others have.
4. **Serve**: `scripts/parse/serve/serve.py point_files` for the new releases (INDEXED serving as JEFF/JENDL/TENDL
   use); `ENDF_RELEASES` in nsr-api gains the names; redeploy nsr-api (`services/nsr-api/deploy.sh`) once per batch,
   not per library.
5. **Marks**: regenerate `held.json` from Athena (`scripts/janis/mark.py`'s query), rerun `mark.py` over
   `lake/janis/2026-11-10/tree-raw.json`, write the split files, copy to `public/janis-tree.json` and
   `public/janis-tree/`, add the names to HELD in `lib/janis-tree.ts`, commit. Also add a `format` field to a
   library node whose files are held but not parsed (multigroup, Nubase text) so the page can show a note instead
   of a bare ✓.
6. **Counts**: `/counts` is table-driven; the masthead ledger in `lib/home-data.ts` is not yours.

## Order (value first; report as each lands)
JEFF-4.0 → JENDL-4.0 and 4.0u → IRDFF-II → FENDL-3.1b → ENDF/B-VI.8-HE, JENDL-4.0/HE, JENDL/HE-2007 → GEFY (seven, small)
→ TENDL-2019, 2017, 2015 → BROND-3.1, CENDL-3.1 → JEFF-3.2, 3.1.2, 3.1.1, 3.1, 3.0, 3.0/A, JEF-2.2 → JENDL specials
(AC, AD, AN, DEU, PD ×3, FPY, FPD ×2, DDF) → EAF-2007/2010, RUSFOND-2010, PADF-2007, IAEA/PD-2019, BROND-2.2,
CENDL-2.1, JENDL-3.3 → TENDL-2014 back to 2009 → TSL rows → Nubase texts → multigroup files.
Parallelise: one box streaming downloads continuously, the Lambda fan-out parsing whatever has landed. Do not wait
for one library's parse to start the next fetch. Keep a `lake/_raw/PROGRESS.json` the lead can read in one call.

## Caution
- A library's licence line goes in SOURCE.md; all of these are public distributions. Do not fetch from a mirror
  that asks for a login.
- Sizes: TENDL years are the bulk; if the night runs short, land every non-TENDL library first and TENDL's neutrons
  sublibrary before its charged particles.
- A parser failure on an old tape (JEF-2.2, JENDL-3.3 have format quirks) is a row in the report, not a stop:
  skip the material, log it in the manifest, go on.
- `lib/janis-tree.ts` is touched by `elpis-wire` for the rename tonight; change only the HELD set and pull first.

## Done means
Every name above either parsed into `nsr.endfb_*` and served, or held in `lake/_raw` and catalogued with its format
noted; the crawl marks regenerated and the ❌ count at the root reported before and after; `scripts/parse/endfb/
README.md` lists every new release with its rerun lines; INVENTORY rows; `docs/briefs/70-…` gets a "## Report"
table: library | source URL | bytes | files | tables | materials | minutes | spend | mark. One final line: libraries
landed / parsed / catalogued only / not found, GB added, total spend, ❌ before → after.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/70-missing-libraries-acquire-parse-mark.md and do it; one line to lead-agent per library.`

## Report
Stopped by Brendan 2026-11-11 ~22:30 UTC (elpis-fill): 42 releases parsed into nsr.endfb_* (A, B, C, Files 4-15), 34 served (nsr-api RELEASES 47), EAF-2007 and Nubase 1997/2003/2016 held as files; marks on the 10:53 UTC crawl copy ❌ 261,889 (brief 68's mark.py) → 157,104 (this one), served from lake/janis/current/ through the CDN; every box terminated, Lambda reserve released, last commit e2145a5.
Not done: the crawl's last 7,566 element pages (stopped mid-run; page cache in lake/_work/janis/pages/), the final mark and report table (scripts/janis/fill/report.py), README counts and INVENTORY rows; unfetched: TENDL 2009–2019 (IAEA only, Webshare allowance spent, 402), TENDL-2013, FENDL-3.1b, JEFF-3.0/A, JENDL-4.0u's other 306 materials, Nubase 2012, GEFY 3.3–5.3, FENDL-2.1 MG, IRDFF-1.0-640g.
