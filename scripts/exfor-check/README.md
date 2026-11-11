# EXFOR TRANS checker (brief 71)

`/elpis/checker` takes a TRANS file (EXFOR exchange format) and lists its errors and warnings per entry and subentry,
with the line, the code and the rule each message breaks. It is my version of JANIS Web's "TRANS Checker tool for EXFOR
compilers".

## Files
| File | What it does |
|---|---|
| `check.py` | The checker. Pure Python, no dependencies. `check(bytes) -> {messages, summary, entries, rules, dictionary}`; CLI `python3 check.py FILE...` prints the report. |
| `dicts.py` | Builds `services/nsr-api/exfor_check_dicts.py` (the dictionary snapshot the Lambda carries). |
| `box.sh` | Ships this folder to the dev box through S3 and runs a command there (`/data/exfor-check/repo`). The Mac runs no Python. |
| `tests/build.py` | Builds the corpus: `tests/clean/*.x4`, `tests/faults.json` and `tests/janis.json`. `--faults` remakes only the faults. |
| `tests/run.py` | Runs the corpus. Every clean file must give no message; every fault must be reported at its line with its rule. |
| `tests/janis.py` | Posts a file to JANIS's checker and parses the answer. |
| `services/nsr-api/exfor_check.py` | The routes: `POST /exfor/check`, `POST /exfor/check/upload` (write key), `GET /exfor/check?key=`. |
| `services/nsr-api/exfor_check_core.py` | Symlink to `check.py`, so build.sh's `*.py` copy puts the checker in the Lambda zip. |
| `services/nsr-api/exfor_check-policy.json` | Inline policy `nsr-api-exfor-check` on role `nsr-api-lambda`: Get and Put on `lake/_work/exfor-check/*`. |

## Decisions
- **Dictionaries.** The snapshot comes from forexy's `dict_9134.json` (git.oecd-nea.org/exfor/tools/forexy, tests/files;
  transmission 9134, 2026-01-24), N. Otuka's JSON of the full archive dictionary. I didn't use the lake's
  `nsr.exfor_dict_*` tables: they come from the IAEA's `latest.json`, which drops the fields the checker needs (227
  nuclides, keyword-to-dictionary pointers and required flags, unit families of headings, units and quantities,
  particle subfield flags, general-modifier flags). To refresh, run `python3 scripts/exfor-check/dicts.py <N>` on
  the box.
- **Reference.** JANIS's own checker, `POST https://www.oecd-nea.org/janisweb/trans-checker` (form field `trans`). The
  NEA's GitLab CI template `exfor/tools/exfor-ci-templates/templates/trans_checker.yml` calls the same endpoint. I
  didn't look further for chex/x4chex once JANIS itself answered. Posts go one at a time, two seconds apart, as
  NSRgpt-crawler/1.0.
- **Line numbers.** Mine point at the record at fault. JANIS often points at the end of the section or the subentry
  instead (RCHEM in 10913.001: JANIS line 281, the ENDSUBENT; mine 257, the METHOD record).
- **Old date forms.** Entries untouched since the four-digit-year conversion still carry yymmdd in N2 and HISTORY, and
  yymm in REFERENCE. JANIS accepts them, so I do too.
- **Subentry 001** may omit NODATA (real files do).
- **ENDSUBENT's count is N1.** The brief's fault "a wrong N2 on ENDSUBENT" is injected as a wrong N1: N1 holds the
  record count, and N2 is zero.
- **Not required:** ERR-ANALYS and TITLE are flagged X in dictionary 2, and STATUS R, but JANIS doesn't require them
  and old entries lack them. KW-REQ asks for AUTHOR, HISTORY, INSTITUTE, REACTION and REFERENCE, plus one of
  FACILITY, METHOD, DETECTOR or ANALYSIS. It runs only when subentry 001 is in the file, because a revision carries
  only the altered subentries. For the same reason, a cross-reference to a subentry the file leaves out is not flagged.
- **EN-MIN or EN-MAX alone** is legal (a threshold, an upper limit). When both are present, the minimum must not be
  above the maximum.
- **EN order** is checked only where the incident energy is the DATA table's one independent variable.

## State (resume here)
- 2026-11-11 03:50 ET: check.py and dicts.py run on the box. On NRDC trans.1356 (2010, 34 entries) mine gives
  1 error and 28 warnings; JANIS gives 2 and 29. The corpus build is running (`/data/exfor-check/build.log` on the box).
- Next: the corpus green → the route deployed (box `build.sh`, then `deploy.sh`, then the policy) → the page →
  types, lint and both themes on the box → commit and push my paths → the brief's Report.
- The box can't write to S3. Files come back to the Mac through `/srv/nsrgpt/public/viz-data/shots/xc/` and
  `curl http://<box-ip>:3000/viz-data/shots/xc/...`.
