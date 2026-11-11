# EXFOR TRANS checker (brief 71)

`/elpis/checker` takes a TRANS file (EXFOR exchange format) and lists its errors and warnings by entry and subentry.
Each message gives the line, the code at fault and the rule it breaks; the rule unfolds its manual text. It is my
version of JANIS Web's "TRANS Checker tool for EXFOR compilers", checked against JANIS itself.

## Files
| File | What it does |
|---|---|
| `check.py` | The checker. Pure Python, no dependencies. `check(bytes) -> {messages, summary, entries, rules, dictionary}`. The command line `python3 check.py FILE...` prints the report and exits 1 on any error. |
| `dicts.py` | Builds `services/nsr-api/exfor_check_dicts.py`, the dictionary snapshot the Lambda carries. |
| `box.sh` | Ships this folder to the dev box through S3 and runs a command in `/data/exfor-check/repo`. The Mac runs no Python. |
| `tests/build.py` | Builds the corpus: `tests/clean/*.x4`, `tests/faults.json`, `tests/janis.json`. `--faults` remakes only the faults. |
| `tests/run.py` | Runs the corpus. Every clean file must give no message; every fault must be reported at its line with its rule. |
| `tests/compare.py` | Compares my messages with JANIS's by entry.subentry and severity, on the corpus or on any TRANS files given. |
| `tests/janis.py` | Posts a file to JANIS's checker (cached by content in `/data/exfor-check/janis-cache`) and parses the answer. |
| `services/nsr-api/exfor_check.py` | `POST /exfor/check?name=`, `POST /exfor/check/upload` (write key: a presigned PUT), `GET /exfor/check?key=` (20 MB cap). Each answer carries `held`, the lake's date for each entry it holds. |
| `services/nsr-api/exfor_check_core.py` | Symlink to `check.py`, so build.sh's `*.py` copy puts the checker in the Lambda zip. |
| `services/nsr-api/exfor_check-policy.json` | Inline policy `nsr-api-exfor-check` on role `nsr-api-lambda`: Get and Put on `lake/_work/exfor-check/*`. |
| `app/(site)/elpis/checker/` | The page and `api/route.ts`, which forwards the file to the API Gateway origin (directly up to 5 MB, through an upload above that). |
| `components/elpis/checker/Checker.tsx` | Drop zone, paste box, the results table with a severity filter, rule text, "Download report", and the file in a mono pane with flagged lines marked. |

Deploy: `aws s3 cp services/nsr-api/ s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/ --recursive --exclude '*' --include '*.py' --include '*.sh'`, then build.sh on the dev box, then `./services/nsr-api/deploy.sh`. The policy is put once with `aws iam put-role-policy`.

## Dictionaries
The source is forexy's `dict_9134.json`: N. Otuka's JSON of the full NRDC archive dictionary, transmission 9134,
2026-01-24, from git.oecd-nea.org/exfor/tools/forexy (tests/files). A copy, with the snapshot made from it, is in
`lake/_work/exfor-check/dictionary/`.

I didn't use the lake's `nsr.exfor_dict_*` tables. They come from the IAEA's `latest.json`, which drops the fields the
checker needs:
- dictionary 227's nuclides
- each keyword's code dictionary and required flags (002)
- the unit families of headings, units and quantities (024, 025, 236)
- particle subfield flags (033)
- general-modifier flags (034)

To refresh, run `DICT_JSON=<file> python3 scripts/exfor-check/dicts.py <N>` on the box.

## Rules (47)
- **File:** FILE-EMPTY, FILE-BINARY (empty, PDF, zip or binary: one error, no trace).
- **Records:**
  - REC-LEN: over 80 columns.
  - REC-CHAR: tabs, control characters, non-ASCII.
  - REC-ID: columns 67-79 against the entry and subentry.
  - REC-SEQ: sequence numbers, with 99999 on the closing records.
- **Structure:**
  - SYS-ORDER: identifier order.
  - SYS-MISSING: unclosed sections; BIB/COMMON/DATA or their NO forms, in order. Subentry 001 may omit NODATA.
  - SYS-N: N1/N2 counts on BIB, ENDBIB, COMMON, ENDCOMMON, DATA, ENDDATA, ENDSUBENT, ENDENTRY, ENDTRANS.
  - SYS-DATE: yyyymmdd, or the old yymmdd; not in the future.
  - SYS-ACC: accession and subaccession form and match.
  - SYS-FLAG: no column-11 flag on NOSUBENT.
  - SUB-DUP, SUB-ORDER, SUB-001 (no DATA in 001).
- **Keywords:**
  - KW-UNKNOWN, KW-OBS (dictionary 2).
  - KW-PLACE: text before the first keyword.
  - KW-DUP.
  - KW-REQ: AUTHOR, HISTORY, INSTITUTE, REACTION, REFERENCE, plus one of FACILITY, METHOD, DETECTOR or ANALYSIS, in the subentry or in 001. Checked only when 001 is in the file.
  - CODE-MISSING: keywords dictionary 2 marks code-required, except MONITOR, DECAY-DATA and DECAY-MON, which JANIS doesn't require.
- **Codes:**
  - CODE-PAREN.
  - CODE-DICT, CODE-OBS, against dictionaries 3, 5, 6 (prefix), 7, 15-23, 30-35, 37, 38, 207, 209, 227 and 236. The keywords covered are INSTITUTE, FACILITY, METHOD, DETECTOR, ANALYSIS, INC-SOURCE, ADD-RES, RESULT, SUPPL-INF, PART-DET, RAD-DET, DECAY-DATA, DECAY-MON, STATUS, HISTORY and REL-REF.
  - REF-FORM: type, source and subfield count per type, inside REFERENCE, REL-REF and MONIT-REF.
  - DATE-FORM: HISTORY, REFERENCE and EXP-YEAR dates.
  - ERR-CORR: the old correlation-coefficient coding of ERR-ANALYS.
  - SAMPLE-FORM: (nuclide,abundance).
- **REACTION** (and MONITOR, ASSUMED):
  - REACT-SYNTAX: units and operators, SF1-SF9; no SF9 under MONITOR.
  - REACT-NUC: Z-SYMBOL-A, the symbol matching Z, presence in 227.
  - REACT-SF: SF2 and SF7 with the particle flags of dictionary 33, SF3 from 30 or 33, SF5 from 31, SF6 from 32, SF8 from 34, SF9 from 35.
  - REACT-QTY: SF5-SF8 in 236, with general modifiers stripped and SF7 matched as given or as `*`; obsolete quantities are warned.
  - REACT-COMB: FY and NU need F in SF3; DA and DE need an outgoing particle; SF3 may not repeat SF2.
- **Tables:**
  - HEAD-DICT, UNIT-DICT.
  - UNIT-QTY: a heading's family against its unit's. DATA and its errors against the quantity: only a unit of an independent variable's family (energy, angle, length, time, temperature) under DATA is an error, because dictionaries 236 and 25 don't map one to one for yields, multiplicities and spectra.
  - TAB-COUNT: headings, units and fields against N1; no unit missing under a heading.
  - TAB-NUM: numbers, including the old `7.27   -05`.
  - TAB-EMPTY: empty columns.
  - TAB-PAIR: -MIN not above -MAX; MONIT and MONIT-ERR need MONITOR.
  - TAB-ORDER: EN in order where it is the table's one independent variable.
  - TAB-DUP: duplicate points.
  - HEAD-REPEAT: the same heading in 001's COMMON, the subentry's COMMON or DATA.
  - HEAD-ADJ: the same heading and pointer twice, apart.
  - HEAD-DEF: MISC under MISC-COL, ANG1… under ANG-SEC, E1… under EN-SEC, MOM1… under MOM-SEC; EN-SEC names secondary energies only.
- **Pointers:**
  - PTR-UNDEF: a heading's pointer must be defined in the BIB; several REACTION codes each need one.
  - PTR-REF: subentry cross-references are 8 characters.

## Corpus (2026-11-11)
- **Clean:** 50 entries held in the lake, from X4Pro 2023-07-14 via nsr-api `/exfor/entry/<n>/text`, each written as a
  TRANS file with record identification. They come from 14 areas (1, 2, 3, 4, A, C, D, E, F, G, L, M, O, S), and JANIS
  passes each with no message. **50 of 50 clean** with mine.
- **Faults:** 50 copies, one injected fault each, 10 kinds × 5:
  - a bad institute
  - a REACTION made (x,TOT)…,DA
  - a unit missing under a heading
  - a non-numeric datum
  - a wrong ENDSUBENT count. The count is N1; N2 on ENDSUBENT is zero, so that's what the brief's "N2" means.
  - ENDBIB deleted
  - a duplicated subentry number
  - two EN values swapped
  - a journal code not in dictionary 5
  - month 13 in a SUBENT date

  **50 of 50** are reported at the fault's line with its rule.
- **JANIS on the same faults:** it flags 44 of 50. It finds none of the 5 EN swaps (it doesn't check the order) and 4
  of the 5 SF3/SF6 faults. At the same line: 15 of 50; elsewhere it points at the section's or subentry's end record.
- **Candidates JANIS rejected** (9 of the 59 tried): mine agrees exactly on 7. On E0811 and O0499, JANIS gives 1
  error ("Ignored field(s)") and mine gives 22 and 25, because a broken DATA table cascades. K2003 is 1/4 against 4/4.
- **Speed:** on the box, c145 (1.54 MB) takes 0.18 s. In the Lambda, a 2.2 MB file takes 0.46 s of checking and
  0.66 s end to end. That's about 0.2 s per MB.

## Mine against JANIS on NRDC TRANS files
Counts are errors/warnings, mine against JANIS:

| File | Mine | JANIS | What differs |
|---|---|---|---|
| trans.1356 (2010) | 3/29 | 2/29 | JANIS gives a flagged NOSUBENT one error per entry ("Entry must end with ENDENTRY"); I give one per record. |
| trans.3139 (2009) | 0/28 | 0/37 | JANIS repeats a subentry-001 MONITOR warning (SF3 repeats SF2) under each of 9 data subentries; I give it once at its line. |
| trans.c145 (2015) | 0/3 | 0/3 | none |
| trans.y008 (2013) | 1/20 | 0/21 | JANIS's dictionary still lists the quantity UND,SIG as obsolete; dictionary 9134 has dropped it, so mine reports SF5 UND as unknown. |
| trans.j011 (2022) | 0/0 | 0/0 | none |

These files are in the NEA's repository exfor/nrdc/trans (Git LFS; `?lfs=true` on the raw-file API).

## What JANIS does that mine doesn't
- **Line numbers:** JANIS reports at the end of the section or subentry; mine reports at the record at fault.
- **Fault count:** after a structural fault, JANIS gives one error and stops reading the entry. Mine goes on, so
  later messages can follow from the first.
- **Older dictionary codes:** JANIS knows some that 9134 dropped (UND,SIG).
- **Things I don't check:** LEVEL-PROP and FLAG contents, HALF-LIFE, the CINDA-only parts of the dictionaries, and
  sorting by anything but EN.

## What mine does that JANIS doesn't
- EN order in single-variable tables.
- Every message names a rule whose text the page unfolds.
- A revision is linked to the held entry in the lake.

## Decisions
- **Reference:** JANIS's own checker, `POST https://www.oecd-nea.org/janisweb/trans-checker` (form field `trans`). It
  is the endpoint the NEA's CI template `exfor/tools/exfor-ci-templates/templates/trans_checker.yml` calls. I didn't
  look further for chex/x4chex once JANIS itself answered. Posts go one at a time, two seconds apart, as
  NSRgpt-crawler/1.0, cached by content.
- **Date forms:** the old forms (yymmdd in N2 and HISTORY; yymm and yy in REFERENCE) are accepted, as JANIS accepts
  them.
- **Partial files:** a cross-reference to a subentry that the file leaves out is not flagged, because a revision
  carries only the altered subentries.
- **Entry link:** the page links a held entry to `/datasets/exfor/<n>`, the app's page that reads `/exfor/entry/<n>`.
- **No /docs article:** the docs area (`lib/docs`, `components/docs`) has no section for tools.
- **Box transfers:** the box can't write to S3, so files come back to the Mac through
  `/srv/nsrgpt/public/viz-data/shots/xc/` and `curl http://<box-ip>:3000/viz-data/shots/xc/...`.
