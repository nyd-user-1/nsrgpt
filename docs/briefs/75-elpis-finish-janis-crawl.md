# Brief 75: Elpis lane C, finish the JANIS tree and record what JANIS draws per page (brief 72: 5r, reference for 5f–5k)

## Objective
The JANIS tree is complete, and for every book page there is a stored record of exactly what JANIS shows, so the UI work and the testing phase compare against data, not memory.

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
| C1 | The 7,566 unfetched element pages | unfetched 0; `tree.json` node counts per library and level reported; ceiling measured (requests a second at first 429/403) and stated |
| C2 | Marks and published copy | `mark.py` rerun, `lake/janis/current/` republished, CDN serves it |
| C3 | Per-page reference for all 7,292 book pages (7 books, 1,396 nuclides) | one JSON per book in `lake/janis/reference/`: per page the libraries drawn and their order, default release, each series (name, evaluated or EXFOR, asterisk or computed flag, symbol or line style), EXFOR set count and ids, axis scales and ranges, axis labels, chart title, bottom-sheet items in order, left-rail nuclides and MTs in order, right-rail items in order |
| C4 | Tabler numbers for a fixed sample | 10 pages per book (70), JANIS'"'"'s tabulated values stored beside C3 for the testing phase and for lane B'"'"'s B1 |
| C5 | Difference list | `docs/analysis/elpis-janis-diff.md`: per book, where Elpis'"'"'s book index and rails differ from C3 (nuclides, MTs, order, libraries drawn, default release), as counts and an itemised file. Facts only; no fixes |

## Notes
- `scripts/janis/crawl.py` holds the session and cookie handling (trap 7b) and the page cache `lake/_work/janis/pages/`; extend it, do not write a second crawler. Stream to disk, hold nothing in memory, parallel across IPs, ramp until refusals show and hold under that (doctrine rule 2).
- C3 comes from JANIS'"'"'s own page payloads (the book page and the requests its plot makes); read one page'"'"'s network calls first and record the format in `scripts/janis/README.md`.
- C4: give lane B (`worker 2-11`, brief 74) its B1 sample first: U-235 MT18, Fe-56 MT102, U-238 MT102, Au-197 MT102, Pu-239 MT18, each for ENDF/B-VIII.0, JEFF-3.3, JENDL-5.
- No UI changes in this lane.
