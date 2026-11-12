# Brief 73: Elpis lane A, acquire the missing libraries and fill the 144 rows (brief 72: 5a, 5e)

## Objective
Every library JANIS draws is held, parsed, served and marked, and no book row JANIS lists is ❌.

## Rules for every lane (brief 72 governs; read it first)
- Goal: Elpis matches JANIS Web. Brief 72 sections 6 (paths), 7 (traps) and 8 (working rules) apply in full.
- Hard-won lessons first: before building anything, read what already works and reuse it: `scripts/janis/fill/`, `scripts/parse/endfb/README.md`, `services/nsr-jobs/`, `docs/HANDOFF-2026-11-11.md`, `~/Code/scripts/SCRAPER-DOCTRINE.md`, `RIG-DOCTRINE.md`, `ORCHESTRATION-DOCTRINE.md`, and the fetch and box patterns in `~/Code/{forge,leuk,govblocks,pax,pax2,hermes,pax-trinity,solar,energy,44B,nsr,cshl}`. Nothing is rebuilt that exists.
- Cost: EC2 boxes are the default for fetch, parse and compute (spot or the cheapest size that does the job, many small steps in parallel on one box before a second box). The existing Lambda `nsr-endf-parse` may be used where it is already the wired path; Lambda spend across all lanes stays under $3, the whole project under $5. Record spend (box type, hours, Lambda GB-seconds) in the report. Anything that would exceed this: stop and message the lead.
- Nothing heavy on the Mac: no python3, AWS CLI one call at a time. Type check and lint on the dev box only. No production deploy, no Next build.
- Shared tree: `git pull --rebase --autostash origin main`, then `git commit -- <paths>`. Commit and push as work lands; no announcement needed.
- Compute in advance, never on click. No button, note, floor or rule JANIS lacks.
- A fetch or job that returns nothing is an error, not a result. Every count is checked against its expected count.
- Done means every row of this brief's ledger is closed with a count or a JANIS comparison. A file fetched but not parsed, served and drawn is not done. Anything that cannot be closed is named to the lead with the reason and what was tried; it is never left out of the report.
- Terminate every box and release `nsr-endf-parse` reserved concurrency at the end.
- Report: append `## Report` to this file (ledger table, counts, spend, open items: target none), commit, then message `new-lead-agent` one line. Message the lead at once on any blocker; otherwise work to done without check-ins.

## Ledger
| # | Item | Closed when |
|---|---|---|
| A1 | TENDL-2009, 2010, 2011, 2012, 2013, 2014, 2015, 2017, 2019 (all sub-libraries JANIS lists) | each in `RELEASES`, material count equals JANIS's tree count |
| A2 | GEFY-3.3, 4.2, 5.2 | parsed to `endfb_fy`, counts equal JANIS's |
| A3 | FENDL-3.1b | served, count equals JANIS's |
| A4 | JEFF-3.0/A | served, count equals JANIS's |
| A5 | JENDL-4.0u: the other 306 materials | 406 served |
| A6 | Nubase 2012 | parsed and served as the other Nubase tables are (parse the three held as files too if JANIS shows their rows) |
| A7 | FENDL-2.1 MG, IRDFF-1.0-640g (multigroup) | parsed and drawn as JANIS draws them (IRDF-2002-MG is the held pattern) |
| A8 | Marks rerun (`mark.py`, `fill/report.py`), README counts, INVENTORY rows | ❌ count for these libraries is 0 |
| A9 | The 144 ❌ book rows (list: `docs/analysis/elpis-missing-rows.html`, script `scripts/elpis/missing-rows.ts`) | book index rebuilt; `mts_missing` is 0 in all seven books, each row drawn from the library JANIS draws it from |

## Notes
- A1–A7: brief 70's report (its last two paragraphs) lists each failed route. Routes not yet tried in order: the publisher (PSI `tendl.web.psi.ch/tendl_<year>/`, khschmidts-nuclear-web.eu for GEFY, JAEA, NEA), Wayback (trap 7d), the method that fetched `raw/iaea/2026-11-07/` (trap 7c), NEA Data Bank and Zenodo/OSTI copies. The proxy budget is spent; do not buy more.
- A5: JENDL-4.0u is JENDL-4.0 plus JAEA'"'"'s update files. Check JAEA'"'"'s update list: if the 306 are the materials 4.0u leaves unchanged from 4.0, serve them from the held 4.0 files, and prove it (JAEA'"'"'s list names exactly the 100 held).
- Deriving a library from a held one is allowed only where a source document proves which materials differ and the rest are byte-identical. Propose it to the lead before doing it; fetching the real file is always first.
- A9: for each of the 144 rows open JANIS'"'"'s page (trap 7b) and record which library and which section JANIS draws. Most should close when A1–A4 land; the rest are a parsing or mapping defect to fix. Coordinate release names with lane B (brief 74), which reconstructs each release you add: message `worker 2-11` as each lands.
- New releases apply to all seven books.
