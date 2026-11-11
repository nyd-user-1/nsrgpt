# 71 — The EXFOR TRANS Checker at /elpis/checker (2026-11-11, 02:50 ET)

You're the worker Brendan pasted this into; call yourself `elpis-check` in reports. Written by `lead-agent` (Fable).
JANIS Web's home page offers two tools mine does not: "Open .jns file" (JANIS's own format, not built) and
"TRANS Checker tool for EXFOR compilers". Brendan: "with the third window you can try building the checker". This
brief defines it; if JANIS's own checker page shows something this brief does not cover, follow JANIS. Report to
`lead-agent` by SendMessage, Efficiency Voice, one line per milestone, one at the end. No questions: decide, record
it in the README, go.

## What it is
EXFOR compilers (the NRDC network's centres) exchange new and revised entries as TRANS files: a batch of EXFOR
entries in the exchange format (the EXFOR Formats Manual, IAEA-NDS-207, and the LEXFOR). Before a TRANS file is
accepted the centre runs a checking code over it: format (the 66-column records, the record counts, the system
identifiers ENTRY/SUBENT/BIB/COMMON/DATA/ENDBIB/ENDCOMMON/ENDDATA/ENDSUBENT/ENDENTRY and their numbering),
dictionary codes (every keyword's codes against the EXFOR dictionaries: institutes, journals, reaction types,
quantities, units, data headings, particles, processes, status, methods, detectors, facilities, ...), reaction
strings (the SF1–SF9 grammar), the data table (heading and unit columns match, numbers parse, monotone energies
where required, no empty columns), and the cross-references (REFERENCE, STATUS pointers, the DECAY-DATA and
HALF-LIFE fields). JANIS's page takes a TRANS file and prints the errors and warnings per entry and subentry, with
the line. Mine does the same, in the house, and better: every message links to the rule it broke.

## Rules
Mac rules (no python3 on the Mac; the code runs on a box and in Lambda). `~/Code/nsrgpt` on main, shared tonight
with `elpis-wire` (the Elpis pages and the rename; it links the home card to `/elpis/checker`, your page) and
`elpis-fill` (libraries): pull --rebase --autostash before each commit, explicit paths, push your files only
(`services/nsr-api/exfor_check*`, `scripts/exfor-check/**`, `app/(site)/elpis/checker/**`,
`components/elpis/checker/**`, your README and INVENTORY rows). Types and lint on the dev box
(http://3.145.136.49:3000; it stops at 07:00 ET; `scripts/devbox/launch.sh start i-0ec4775a5cd68d41b` restarts
it). CI is off; pushes reach the box only. House style: paper palette, display face for the title, mono for file
text, the house table for results, "badge" or "chip" never "pill", no captions the layout already says, first
person singular. Never print a secret value; name the SSM parameter.

## What the lake already holds for it
- The EXFOR dictionaries as tables: `nsr.exfor_dict_*` (quantities, data_units, data_headings, institutes, journals,
  reaction_types, particles, processes, status, methods, detectors, facilities, modifiers, parameters, system
  identifiers, information identifiers, elements, chemical compounds, books, conferences, reports, reference types,
  history, data types, data libraries, incident sources, analyses, branches, additional results, supplemental
  information, dictionaries) and the raw dictionary files `exfor_dict003`…`dict567`. Snapshot the ones the checker
  needs into one JSON the Lambda carries (build script in `scripts/exfor-check/dicts.py`; one Athena pass; record
  the dictionary version from `exfor_dict_dictionaries`).
- The EXFOR master in exchange format under `lake/exfor/` (brief 12; `exfor_entries`, `exfor_subent`, `exfor_data`,
  `exfor_x4trans` lists the TRANS files the master came from). Real entries are the test corpus: any held entry,
  written back out as a TRANS file, must pass clean.
- `services/nsr-api/` serves `/exfor/entry/<n>` (`/text` gives the entry's exchange-format text): the checker's
  "show me the entry" link, and the source for test files.
- nsr-jobs (`services/nsr-jobs/README.md`) runs long work on a box with a write key; a TRANS file is at most a few
  MB and a check takes seconds, so the checker is a Lambda route, not a job.

## Build
1. **The checker** (`scripts/exfor-check/check.py`, pure Python, no dependencies, importable by the Lambda): input
   text, output a list of `{line, entry, subent, severity: error|warning, code, message, rule}` where `rule` is a
   short id that the page expands (the Formats Manual section). Cover, in this order: record structure and
   numbering; keyword spelling and placement (BIB keywords, COMMON/DATA headings); dictionary codes for every coded
   keyword; REACTION strings (SF1 target, SF2 incident, SF3 process, SF4 product, SF5 branch, SF6 parameter, SF7
   particle, SF8 modifier, SF9 data type; the combination rules in dictionary 236/36); units against quantities;
   the data table (column count = heading count = unit count, numeric parse, the EN/EN-MIN/EN-MAX pairs, MONIT
   pairs); pointers; dates and the N1/N2 counts on every system line. Each check is a function with the manual's
   section in its docstring.
2. **The reference**: look for the IAEA/NNDC checking code (the NRDC's `chex`/`x4chex`, Fortran, in the NRDC codes
   area under `www-nds.iaea.org/nrdc/` or NNDC's software page; the IAEA hosts answer a Cloudflare challenge to
   plain clients, so try NNDC and Wayback first). If obtainable, build it on the box and run both over the test
   corpus; every disagreement is either my bug (fix) or a documented difference (README). If not obtainable in
   30 minutes, say so in the report and rely on the corpus.
3. **Test corpus** (`scripts/exfor-check/tests/`): 50 held entries written as TRANS files (must pass clean; any
   message there is a false positive to fix), and 50 copies with injected faults, one each (a bad institute code,
   a REACTION with an impossible SF3/SF6 pair, a units column shorter than the headings, a non-numeric datum, a
   wrong N2 on ENDSUBENT, a missing ENDBIB, a duplicated subentry number, an EN column out of order where it must
   be monotone, a journal code not in the dictionary, a date in the wrong form). Every injected fault is reported
   at its line with the right code.
4. **The route**: `POST /exfor/check` on nsr-api (`services/nsr-api/exfor_check.py`; the file in the body, up to the
   gateway's limit; above it, a presigned PUT to `lake/_work/exfor-check/<id>` then `GET /exfor/check?key=`),
   returns the message list and a summary (entries, subentries, errors, warnings, seconds). Deploy with
   `deploy.sh`; the dictionary JSON ships inside the zip.
5. **The page** `/elpis/checker`: a drop zone and a paste box; the results in the house table (line, entry, subentry,
   severity badge, code, message, the rule as a link that unfolds the manual text); a filter by severity; "Download
   report" as text in the checker's own format; the file's text in a mono pane with the flagged lines marked; the
   entry link to `/exfor/entry/<n>` where the entry exists in the lake (a revision) with a note "revises the held
   entry". The JANIS card on the Elpis home links here (`elpis-wire` does that link).
6. **Docs**: `scripts/exfor-check/README.md` with the rule list and what the reference code does that mine does
   not; a `/docs` article if the docs area has a place for tools (check `components/docs`).

## QA
Both themes on the box, types and lint clean; the 100-file corpus run recorded in the README with counts; a 2 MB
TRANS file checks under 10 s; a malformed file (binary, empty, a PDF) returns one clear error, no stack trace.

## Done means
The route deployed and the page live on the box, the corpus green, the README, an INVENTORY row,
`docs/briefs/71-…` with a "## Report" section at its foot (commits, rules implemented, rules not implemented,
reference code found or not, the disagreements). One final line: rules, corpus pass counts, seconds per MB.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/71-exfor-trans-checker.md and do it; one line to lead-agent per milestone.`
