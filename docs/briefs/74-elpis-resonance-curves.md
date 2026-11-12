# Brief 74: Elpis lane B, resonance curves and computed series for every release (brief 72: 5b, 5d)

## Objective
Every release JANIS draws has its cross sections reconstructed through the resonance range in advance, stored and served, so each curve equals JANIS'"'"'s. Every computed series JANIS draws is drawn; none it does not.

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
| B1 | Method fixed against JANIS | for 5 nuclides across 3 releases, my curve against JANIS'"'"'s Tabler numbers: temperature, tolerance and grid stated, differences within JANIS'"'"'s own print precision |
| B2 | Reconstruction of every served release with File 2 parameters (45 today, plus each release lane A adds) | materials reconstructed equals materials with resolved or unresolved parameters in `endfb_res_ranges`, per release; failures 0 or named |
| B3 | Stored and served | `/endf/xs` returns the reconstructed curve by default for every release, same serving path as the POINT releases (`serve.py point_files`, `xs_series/series.bin`); no jobs call from the page |
| B4 | Computed series (5d) | list of every kind JANIS computes (asterisked rows: MT 5 production, sums, redundant MTs), each served for all seven books; any Elpis-only computed series listed for lane C to remove |
| B5 | `res-ranges-n.json` and the book index reflect B3 | no span in any book still depends on File 3 background alone |

## Notes
- Tooling held: PREPRO on `nsr-jobs-1` (`/opt/prepro/bin-o2`, linear → recent → sigma1), `services/nsr-jobs/`, `components/elpis/reconstruct.ts` (the per-click path this replaces). Run PREPRO in bulk on boxes: one process per core, one material per process, output straight to S3. The lake is the checkpoint: a material with an output object is done, rerun picks up the rest.
- B1 first, on one small box, before the bulk run: JANIS states its reconstruction settings in its documentation and Tabler output; match them (0 K or 293.6 K is settled by JANIS'"'"'s numbers, not by assumption).
- Size the bulk run from a timed sample of 50 materials, then pick the box count that finishes in under an hour within the cost rule. State the estimate to the lead in one line and proceed if it is within the cap.
- Do not remove the Reconstruct button or the dashed spans from the UI; that is the UI lane'"'"'s, after B3. Tell the lead when B3 is true.
- Lane A (brief 73, `worker-1-11`) will message you as each new release lands; reconstruct it the same way.
- All seven books: charged-particle and photon sub-libraries carry File 2 rarely; verify by count, do not assume.
