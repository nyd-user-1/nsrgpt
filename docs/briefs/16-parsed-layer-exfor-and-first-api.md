# 16 — Parsed layer, part 2: EXFOR into tables, then the first serving tables and cached API (2026-11-08)

You're `parsing-2`. Brendan assigned this through agent-1 (the night lead, this brief's author). Report to agent-1 with
SendMessage (name `agent-1`) after each table group lands: 3–5 lines, Efficiency Voice. Blockers go to agent-1; don't
stop. parsing-1 works beside you on ENSDF, XUNDL and ENDF/B (brief 15); share nothing but the conventions.

NSRgpt: "Find, read, connect and work with nuclear data. In seconds." The shape: a lakehouse in S3 with raw, parsed and
serving layers, a cached API and search layer, a thin static UI. This brief turns EXFOR, the experimental reaction
database, into tables in the lake, registered in Athena, with counts that match the reference. If time remains, it
builds the first serving tables and the cached API that the EXFOR search page (the remake of nds.iaea.org/exfor) will
read. Brendan's rule for that page: an exact remake of IAEA's function over current data, with every calculation
checkable against the live site.

## Rules (Brendan's, standing)
1. Efficiency Voice: `docs/sketches/2026-11-06-efficiency-voice.html`. Read it first. Plain language.
2. The Mac is an 8 GB MacBook Air: no `python3` on it; the AWS CLI one call at a time, never parallel, never
   backgrounded together; no builds. Parsing runs on an EC2 box (below). No file over a few MB lands on the Mac.
3. No commits, no pushes (tell agent-1 what changed; the lead commits). No subagents.
4. Write only in: `scripts/parse/exfor/`, `scripts/parse/serve/`, `services/nsr-api/` (new), the lake prefixes
   below, new rows in the lake's `INVENTORY.md`. Don't touch `app/`, `components/`, `lib/` (ui-layer owns them),
   `scripts/iaea/` (raw-layer), `scripts/parse/{ensdf,endfb,box}/` (parsing-1).
5. Copy from the named source, then adapt (EV rule 14): the box pattern is `scripts/iaea/box/create.sh` and `ssm.sh`;
   the count logic is `services/nsr-count/lambda_function.py`; the Lambda packaging pattern is `services/nsr-fetch/`.
6. Spend cap for this brief: $3. Free routes first (Lambda and API Gateway free tiers, CloudFront free tier); name any
   paid step and its price in a report before taking it. Keep a spend list in each manifest.

## Sources (all in `s3://nsr-lake-613473203863`, profile `nysgpt-new`, us-east-2)
- X4Pro, IAEA's EXFOR as one SQLite database: `raw/iaea/2026-11-07/cdroms/dwn/x4sqlite-20251105-c.zip` (1.2 GB zip,
  2025-11-05; earlier builds beside it: `x4sqlite-20230714-c.zip`, `x4sqlite-20230516-c.zip`, 3.1 GB each, and
  `x4sqlite-20231008-a.zip`). Open the 2025 one first; if it is a reduced build (fewer tables or rows than 2023),
  use the newest full one and say so.
- EXFOR in JSON (J4): `raw/github/IAEA-NDS/EXFOR-JSON-File/034c257a47de7fa5babe3691726bc61c5ff72470.tar.gz` (316 MB;
  27,116 entries as of the pinned commit, data 2026-10-28 by IAEA's page).
- C5 (computational format with renormalized values and uncertainties): `raw/iaea/2026-11-07/cdroms/dwn/EXFOR-C5v4-20230828.zip`.
- x5json: `raw/iaea/2026-11-07/cdroms/dwn/EXFOR-x5json-20230828.zip`.
- The EXFOR dictionary: `raw/github/IAEA-NDS/exfor_dictionary/…tar.gz`. Parsers held: `raw/github/IAEA-NDS/exforparser/`,
  `raw/github/afedynitch/x4i3/` and `raw/pypi/2026-11-07/x4i3/`, `raw/github/IAEA-NDS/exfortables_py/`.
- Convention to follow: `lake/nsr-database/2026-10-15/nsr/public.<table>/1/part-*.parquet`, Glue database `nsr`,
  Athena workgroup `nsrgpt`, results under `work/athena-results/`. See `lib/chat-data/athena.ts` for the read side.
- The search page's recipe: the collapsible prompt at the bottom of `docs/sketches/2026-11-07-exfor-replica.html`,
  and the IAEA help pages copied to `raw/iaea/2026-11-07/exfor/help/`.

## Reference counts (Lambda nsr-count over J4, 2026-11-07)
27,116 entries; 223,615 subentries; 88,813 reaction codes; 19,439,354 data rows; 76.5 million values.

## Where tables go
- `lake/exfor/x4pro-2025-11-05/<table>/part-*.parquet` (or the build you used; one folder per table), `lake/exfor/j4-2026-10-28/<table>/…`,
  `lake/exfor/c5-2023-08-28/<table>/…`, `lake/exfor/dictionary/<table>/…`. Parquet, Snappy; partition only tables
  over about 1 GB (data points by entry prefix is fine).
- Athena: database `nsr`, tables `exfor_<table>` for X4Pro, `exfor_j4_<table>`, `exfor_c5_<table>`,
  `exfor_dict_<table>`. Register with `CREATE EXTERNAL TABLE … STORED AS PARQUET LOCATION` through
  `aws athena start-query-execution --work-group nsrgpt --query-execution-context Database=nsr`, one call at a time.
  Keep every DDL in `scripts/parse/exfor/ddl/<table>.sql`.
- A manifest per folder at `lake/exfor/<folder>/manifest.json`: source key and bytes, tool and version, each table's
  name, columns, rows, bytes, the counts check against the reference (explain any difference), built-at, spend.

## The box
1. `scripts/parse/box/userdata.sh` is parsing-1's; if it isn't there yet when you start, write your own copy as
   `scripts/parse/exfor/userdata.sh` from `scripts/iaea/box/userdata-wb-24h.sh`: python3-venv, venv at `/opt/parse`
   with `boto3 pyarrow pandas duckdb`, sqlite3, unzip; 24-hour self-shutdown; `/opt/box/ready`.
2. `./scripts/iaea/box/create.sh nsr-parse-2 m7i-flex.large <that user-data> 100`; reach it through `ssm.sh`;
   terminate it when done. Scripts go to the box through S3 (`lake/_work/parse/exfor/`), never pasted into SSM.

## Step 1 — X4Pro to Parquet, table for table
1. Unzip on the box; list every table and its row count with sqlite3 or DuckDB. Write the list to the manifest first.
2. Convert every table 1:1 to Parquet with DuckDB (`ATTACH` the SQLite file, `COPY (SELECT * FROM t) TO … (FORMAT
   PARQUET)`); column names kept, types as SQLite declares them, text columns as UTF-8. No table is skipped, not even
   lookup tables; the X4Pro schema is IAEA's, and the search page's filters map onto it directly.
3. Register all of them. Counts: entries and subentries must agree with the reference to within what the X4Pro
   build date explains (say the difference and the reason).

## Step 2 — J4 to Parquet
1. From the J4 JSON, flatten to `entries` (entry, institute, year, title, authors as array, references as array,
   date, status), `subentries` (entry, subent, bib fields: reaction string, target, quantity, product, method,
   facility, detector, monitor, err-analys text, …), `reactions` (subent, pointer, reaction code and its parsed
   parts: target ZA, projectile, process, product, quantity), `data_points` (subent, pointer, row, every column as
   name, value, unit, and the x-y role), and `data_columns` (subent, column name, unit, role). Use `exforparser` or
   `x4i3` for the reaction-code parse if either passes a spot check against the dictionary; otherwise write the
   parse from the dictionary's own tables and say so.
2. Counts: 27,116 entries, 223,615 subentries, 88,813 reaction codes, 19,439,354 data rows, 76.5 million values.
3. Register `exfor_j4_*`. Cross-check: the same subentry in X4Pro and J4 must have the same number of data rows for a
   sample of 50 random subentries; report the result.

## Step 3 — C5 and the dictionary
1. C5: one table `points` (entry, subent, pointer, target, projectile, mf, mt, product, energy, d_energy, data,
   d_data, cos_or_lo, d_cos, elv_or_hl, d_elv, i78, refer, year, and the renormalization and uncertainty columns C5
   carries); register `exfor_c5_points`.
2. The dictionary (`exfor_dictionary` JSON): one table per dictionary (institutes, reactions, quantities, units,
   …), registered `exfor_dict_*`. These drive the search page's "?" pickers.

## Step 4, if time remains — first serving tables and the cached API
1. Serving tables under `lake/serve/exfor/<version>/`, built by Athena CTAS from the tables above, each one
   query away from a page: `search_index` (one row per subentry with target, projectile, process, product,
   quantity, energy min and max in eV, year, first author, institute, point count, has_c5), `targets`, `reactions`,
   `quantities` (distinct values with counts, for the pickers). DDL in `scripts/parse/serve/ddl/`.
2. The API: Lambda `nsr-api` (`services/nsr-api/`, Python 3.12, DuckDB with httpfs reading the serving Parquet
   straight from S3, role read-only on `lake/serve/*` and `lake/exfor/*`), behind an API Gateway HTTP API, fronted by
   CloudFront with a cache policy that keys on the query string and caches 1 hour. Endpoints: `GET /exfor/search`
   (the search form's fields as query parameters, 100 rows a page), `GET /exfor/subentry/{id}` (bib and data
   points), `GET /exfor/pickers/{name}`. Deploy with a script in `services/nsr-api/deploy.sh` copied from
   `services/nsr-fetch/`'s pattern. Price: inside the free tiers; say so.
3. Verify with `curl` from the Mac: `/exfor/search?target=U-235&quantity=SIG` returns rows in under a second on the
   second hit; report the first-hit and cached latencies.

## Done means
1. EXFOR in Parquet (X4Pro, J4, C5, dictionary) under `lake/exfor/`, registered in Athena, counts matching or
   explained, manifests, `INVENTORY.md` rows.
2. `scripts/parse/exfor/` with the scripts, DDL and a README line on how to rerun.
3. If reached: serving tables under `lake/serve/exfor/` and the API's URL, with its latencies.
4. Reports to agent-1 after each step; a final report with rows, bytes, spend, what's unparsed and why. Box terminated.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/16-parsed-layer-exfor-and-first-api.md and start; report to agent-1 after each step.`
