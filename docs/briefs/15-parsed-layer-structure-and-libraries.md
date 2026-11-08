# 15 — Parsed layer, part 1: ENSDF, XUNDL and ENDF/B into tables (2026-11-08)

You're `parsing-1`. Brendan assigned this through agent-1 (the night lead, this brief's author). Report to agent-1 with
SendMessage (name `agent-1`) after each dataset lands: 3–5 lines, Efficiency Voice. Blockers go to agent-1; don't stop.

NSRgpt: "Find, read, connect and work with nuclear data. In seconds." The shape: a lakehouse in S3 with raw, parsed and
serving layers, a cached API and search layer, a thin static UI. The raw layer is landing tonight (raw-layer agent).
This brief is the parsed layer for three of the five core databases: ENSDF, XUNDL (same format) and ENDF/B. Every
record in those files becomes a row in a Parquet table in the lake, registered in Athena, with counts that match the
reference counts below. Nothing is dropped: what a schema doesn't name goes into a raw records table.

## Rules (Brendan's, standing)
1. Efficiency Voice: `docs/sketches/2026-11-06-efficiency-voice.html`. Read it first. Plain language.
2. The Mac is an 8 GB MacBook Air: no `python3` on it; the AWS CLI one call at a time, never parallel, never
   backgrounded together; no builds. Parsing runs on an EC2 box (below). No file over a few MB lands on the Mac.
3. No commits, no pushes (tell agent-1 what changed; the lead commits). No subagents.
4. Write only in: `scripts/parse/` (new), the lake prefixes below, new rows in the lake's `INVENTORY.md`. Don't touch
   `app/`, `components/`, `lib/` (ui-layer owns them), `scripts/iaea/` (raw-layer owns it), `services/`.
5. Copy from the named source, then adapt (EV rule 14): the box pattern is `scripts/iaea/box/create.sh` and `ssm.sh`;
   the count logic that defines the reference numbers is `services/nsr-count/lambda_function.py`. Use held parsers
   before writing one.
6. Spend cap for this brief: $3 (box hours, Athena scans, S3 requests). Free routes first; name any paid step and its
   price in a report before taking it. Keep a spend list in each manifest.

## Sources (all in `s3://nsr-lake-613473203863`, profile `nysgpt-new`, us-east-2)
- ENSDF: `raw/nndc/2026-11-07/ensdfarchivals/distributions/dist26/ensdf_261105.zip` (42 MB; the 2026-11-05
  release; the whole library as 80-column text files). Manual and evaluator guidelines: `raw/nndc/2026-11-07/ensdf/`.
- XUNDL: `raw/nndc/2026-11-07/xundlarchivals/distributions/dist26/xundl_261001.zip` (13 MB; release 2026-10-01;
  same format).
- ENDF/B-VIII.1: `raw/nndc/2026-11-07/endf-releases/releases/B-VIII.1/ENDF-B-VIII.1.tar.gz` (1.1 GB; ENDF-6 text,
  every sublibrary) and its `metadata.json`. Earlier releases sit beside it under `endf-releases/releases/` and
  `raw/nndc/2026-11-07/endf-library/`. Leave ACE, GNDS and POINT alone (processed forms).
- Parsers held: `raw/github/IAEA-NDS/endf-parserpy/…tar.gz` and `raw/pypi/2026-11-07/endf-parserpy/` (ENDF-6
  reader, pure Python), `raw/github/paulromano/endf-python/`, `raw/github/njoy/ENDFtk/` (C++), `raw/github/LLNL/fudge/`.
  For ENSDF there is no held parser; the format is fixed-column and documented in the manual. `pip install` on the
  box is allowed for a published parser if you find one that passes the counts.
- Existing parsed layer, the convention to follow: `lake/nsr-database/2026-10-15/nsr/public.<table>/1/part-*.parquet`
  (one folder per table, Parquet parts), catalogued in Glue database `nsr`, queried by Athena workgroup `nsrgpt`
  with results under `work/athena-results/` (expire after 7 days). See `lib/chat-data/athena.ts` for the read side.

## Reference counts (from Lambda nsr-count, 2026-11-07; your tables must reproduce them)
- ENSDF 2026-11-05: 20,117 datasets; 568,228 levels (L); 793,431 gammas (G); 129,399 other records (B, E, A, D,
  reference and the rest); 1,491,058 records in all.
- XUNDL 2026-10-01: 12,547 datasets; 194,604 levels; 257,154 gammas; 20,176 other; 471,934 in all.
- ENDF/B-VIII.1: 5,135 materials (distinct file + MAT) across sublibraries (decay 3,821 · neutrons 558 ·
  photonuclear 222 · thermal scattering 114 · atomic relaxation, electrons, photo-atomic 100 each · protons 49 ·
  fission yields 40 · standards 11 · deuterons 6 · tritons, alphas 5 each · helium-3 4); 32,347 MF3 cross sections;
  2,587,259 MF3 points. All nine releases: 22,315 materials, 9,127,277 points.

## Where tables go
- `lake/ensdf/2026-11-05/<table>/part-*.parquet`, `lake/xundl/2026-10-01/<table>/…`, `lake/endfb/B-VIII.1/<table>/…`
  (later releases: `lake/endfb/<release>/…`). Parquet, Snappy, sensible row groups; a folder per table; Hive-style
  partition folders only where a table exceeds about 1 GB (`mf=`/`mt=` for ENDF points is fine).
- Athena: database `nsr`, table names `ensdf_<table>`, `xundl_<table>`, `endfb_<table>` (one table per release
  folder is wrong; use a `release` column and partition by it when you add releases). Register with
  `CREATE EXTERNAL TABLE … STORED AS PARQUET LOCATION 's3://…'` through
  `aws athena start-query-execution --work-group nsrgpt --query-execution-context Database=nsr`, one call at a time,
  then `MSCK REPAIR TABLE` for partitioned ones. Keep every DDL in `scripts/parse/<dataset>/ddl/<table>.sql`.
- A manifest per dataset at `lake/<dataset>/<version>/manifest.json`: source keys with bytes, parser and version,
  each table's name, columns, rows and bytes, the counts check (reference vs yours, with any difference explained),
  built-at, spend.

## The box
1. `scripts/parse/box/userdata.sh`: copy `scripts/iaea/box/userdata-wb-24h.sh` and adapt: python3-venv, a venv at
   `/opt/parse` with `boto3 pyarrow pandas duckdb` and the parsers you choose; 24-hour self-shutdown; `/opt/box/ready`.
2. `./scripts/iaea/box/create.sh nsr-parse-1 m7i-flex.large ../../parse/box/userdata.sh 100` (Free Tier type, 100 GB
   gp3; the script resolves the user-data path relative to its own folder, so pass it that way or copy the file in).
   Reach it only through `scripts/iaea/box/ssm.sh`. Terminate it when the brief is done.
3. Scripts live in `scripts/parse/<dataset>/` and are copied to the box through S3 (`lake/_work/parse/`), never
   pasted into SSM commands. Each writes Parquet locally then uploads with one `aws s3 sync` per table folder (on the
   box, the CLI can run freely).

## ENSDF and XUNDL (one parser, two runs)
1. Tables: `datasets` (nucid, z, a, dsid, dstype, dsref, publication, date, history flags), `levels` (nucid, dsid,
   level_seq, energy_kev, energy_unc, jpi, half_life, half_life_unit, half_life_unc, l, s, spin_flag, ms, question,
   band, continuation fields as a JSON string), `gammas` (nucid, dsid, level_seq, e_gamma, unc, ri, ri_unc, mult,
   mr, mr_unc, cc, cc_unc, ti, ti_unc, coincidence, question), `betas` (B), `ec` (E), `alphas` (A), `delayed` (D),
   `parents` (P), `normalization` (N and PN), `qvalues` (Q), `xrefs` (X), `references` (R), `comments` (C, D, T
   records with their text), and `cards` (every line: nucid, dsid, seq, rtype, continuation flag, raw 80-column
   text). Numeric fields parsed to doubles where the manual defines them; the raw string kept beside the number.
2. Counts: `datasets`, `levels`, `gammas` and the sum of the others must equal the reference above for each release.
   A difference is explained in the manifest (what nsr-count counted that your schema places elsewhere), not hidden.
3. Register `ensdf_*` and `xundl_*` in Athena; `SELECT COUNT(*)` each once (cheap) and put the numbers in the manifest.

## ENDF/B
1. Start with B-VIII.1. Unpack the tape set; every file is one or more materials. Tables: `materials` (release,
   sublibrary, file_name, mat, za, zsymam, awr, nlib, nver, lrel, nsub, nmod, temp_k, lrp, lfi, nfor, description
   lines), `sections` (release, sublibrary, mat, mf, mt, line_count), `xs_points` (release, sublibrary, mat, mt,
   energy_ev, xs_barn, interpolation_region, point_seq) for every MF3 section, and `records` (release, sublibrary,
   mat, mf, mt, line_no, text) for every line of every file so nothing is lost. MF1 descriptive text goes to
   `materials.description`.
2. Counts: 5,135 materials, 32,347 MF3 sections, 2,587,259 points for B-VIII.1, by sublibrary as listed above.
3. Register `endfb_*` with `release` as a partition column; then add B-VIII.0, B-VII.1, B-VII.0, B-VI.8 and the
   older releases the same way as time allows, checking each release's material count against nsr-count's (ask
   agent-1 for the per-release numbers if you need them; they're on the lake page's Diagram tab).

## Done means
1. Three datasets in Parquet under `lake/`, registered in Athena database `nsr`, counts matching the reference or
   explained, a manifest each, `INVENTORY.md` rows added (download, edit, upload: one call each).
2. `scripts/parse/{ensdf,endfb,box}/` with the parser scripts, DDL and a README line each on how to rerun.
3. Reports to agent-1 after ENSDF, after XUNDL, after each ENDF/B release; a final report with rows, bytes, spend,
   and anything unparsed and why. Box terminated.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/15-parsed-layer-structure-and-libraries.md and start; report to agent-1 after each dataset.`
