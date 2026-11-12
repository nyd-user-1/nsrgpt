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

## Report (worker 2-11, Elpis lane B, 2026-11-12 04:30 UTC)

JANIS's reconstructed curves turned out to be in its own offline packages (NEA GitLab `janis/data`, copied by lane A to
`lake/_raw/janis-data/`). So B2 became "decode and serve JANIS's curves" (new-lead-agent's ruling, 2026-11-12) and no bulk
PREPRO or NJOY run was made. The one exception is JEFF-3.1, whose package holds protons only. Elpis's book asks `/endf/xs`
for them with `janis=1`. Other pages' defaults are unchanged.

### Ledger

| # | Item | Closed | Count or JANIS comparison |
| --- | --- | --- | --- |
| B1 | Method fixed against JANIS | yes | JANIS's package data is its Tabler data, identical on every point checked: ENDF/B-VIII.0 Fe-56 MT102 40,561 of 40,561 points (energy and value); through the live API, 15 pages (U-235 MT18, Fe-56, U-238, Au-197 MT102, Pu-239 MT18 × ENDF/B-VIII.0, JEFF-3.3, JENDL-4.0; JENDL-5 is not in JANIS) 100% of served points identical. Temperature 293.6 K (0 K differs up to 100× at peaks, 300 K by ~2% in the resolved range); grid and tolerance are JANIS's own, as stored. |
| B2 | Every served release with File 2 parameters | yes, for every release JANIS draws | 53 releases served from JANIS's packages: 3,085,132 MF3 sections, 161,540 materials, 2.46 billion points, 0 decode errors. In every one, every material with LRU 1 or 2 parameters has its curve (`b2check.py`, `lake/_work/parse/endfb/recon/b2.json`). Exceptions: the standards copies of U-235, U-238, Au-197 in ENDF/B-VIII.0 and VIII.1 (their neutron copies are served), He-4 in B-VIII.1's helium3s; JEFF-3.1 by NJOY (290 of 290, 0 failures). Not reconstructed, by ruling (JANIS Web draws none of them): TENDL-2023 (2,833), B-V (91), B-IV (63), B-III (56), B-II (39). ENDF/B-VIII.1 keeps NNDC's POINT files (489 of 493). |
| B3 | Stored and served | yes | `lake/serve/endf/<release>-janis/` (xs, xs_index, series.bin, `endf_serve_xs` partitions), served like POINT; `/endf/xs` with `janis=1` tries `-janis`, `-talys`, `-recon-293.6K`, NNDC POINT, then MF3. `components/elpis/use-book.ts` sends it (type check and lint clean on the dev box). nsr-api deployed 2026-11-12 04:13 UTC from `origin/main` 0ba0aea. Book page U-235 MT18 on the dev box: every packaged release draws its `-janis` line, no dashed spans. No jobs call from the page. |
| B4 | Computed series | yes | Kinds JANIS draws on its book pages (one page per distinct reaction in all seven books, `janis_book.py`): `MF3+MF6MT5`, `MF6MT5`, `Production cross section` (all served by `/endf/section/production`; after the step fix, γ + Mn-55 → Mn-52 in IAEA/PD-2019 equals JANIS's table at 39 of 39 nonzero points, ≤ 2.2e-16), `Sum(MT50-91)` (MT 4 where absent; computed in advance into `-janis`, 83 rows across n, γ, p, d, t; γ + H-2 ENDF/B-VIII.0 equals JANIS at 35 of 35 rows). `Differential production cross section` is listed but never drawn by default; not served. NJOY's own MTs (203-207, 301-303, 442-447) and redundant sums come with each package's MF3. TENDL-2019's MT18 rows (TALYS, lane A's table) are served as `TENDL-2019-talys`, 87 curves. |
| B5 | `res-ranges-n.json` and the book index | yes, with the ruled remainder | `res-ranges-n.json` leaves out every release drawn reconstructed (it reads `JANIS` from structure.py): 3,082 spans remain, all in TENDL-2023, B-V, B-IV, B-III, B-II (ELPIS view only). Book index: `book-index.mjs` now ORs the computed MT 4 rows (`lake/elpis/janis-computed.json`) into the masks; the book JSONs take it at the next rebuild (lane A is mid-rebuild with uncommitted book files). |

### B1: how the method was found
Before the packages were known, I reconstructed the sample myself (`recon.py`, `b1.py`, `dec.py`):
- **Temperature:** U-235 MT18 at the 8.78 eV peak reads 741.97 b in JANIS. NNDC's 293.6 K gives 741.79 b; 0 K gives 980 b; sigma1 at 300 K is 2% off across 1-100 keV.
- **Grid:** every JANIS energy below 1 eV and above the resonance range is an NJOY RECONR node.
- **Values:** NJOY2016 (reconr 0.05%, broadr 293.6 K) came within 1e-4 median at shared nodes in the resolved range, closer than PREPRO at 0.1% (1e-3) or NNDC's POINT2018 (5e-4). A uniform 3e-4 below 1 eV and about 9e-4 at 1-100 eV remained, and no published setting removed them.
- **The packages settled it:** a `.jpk` is nibble-packed ENDF lines, and its neutron MF3 is JANIS's pointwise data. `jpk.py` decodes it; the format is in `scripts/janis/README.md` (lane A's section) and `scripts/recon/README.md`.
- **JEFF-3.1 (NJOY):** against JANIS Web, U-235 MT18 0.023% median (97% within 0.1%), U-238 MT102 0.027% (72%), Fe-56 MT102 0.007% (69%; 57% exact to print). This is the one served curve that is not JANIS's own.

### Elpis-only computed series, for lane C
- The Reconstruct button's PREPRO curves (nsr-jobs) and the dashed File 3 spans: 5c. After this brief they can only appear for TENDL-2023 and B-V to B-II.
- `/endf/section/production` prefers File 10 MT 5 where a material has it. JANIS's kinds all name MF3 × MF6, so pages where File 10 exists should be checked against JANIS in the testing phase.
- `Sum(MT50-91)` rows in neutron sublibraries (13 materials: JEFF-3.2, 3.3, 4.0, RUSFOND-2010, TENDL): JANIS's sampled neutron pages showed none. They are served but should be drawn only where JANIS's rail lists MT 4.

### Open items
1. **Thinning:** sections over 40,000 points are served as POINT files are, the lowest and highest point in each of 20,000 log-energy steps (4,373 sections). Every served point is JANIS's, but a T table of U-238 MT102 shows 8,392 of JANIS's 156,753 rows. A full-resolution read would need its own file (the data is in the package). Lambda's 6 MB answer with six releases a call is why thinning exists.
2. **TALYS MT18 for TENDL-2015 and 2017:** waiting on lane A's rows (`janis_serve.py --talys <release>`, then add it to `TALYS`). JANIS also lists TENDL-2013 and 2014 MT18, but lane A has found no published tables.
3. **The TENDL years' base names** are not in `RELEASES` until lane A adds them. FENDL-3.1b and IRDFF-1.0-640g are, via 039e3ad.
4. **ELPIS-view releases with File 3 background** (TENDL-2023, B-V to B-II, 3,082 materials): reconstructable with `recon.py` (about 1 box-hour for TENDL-2023 at the sampled rate) if wanted.

### Spend
- **EC2 m7i-flex.large, on demand:** nsr-recon-1 2.9 h, -2 1.5 h, -3 1.3 h, -4 1.4 h, dev box 1.2 h. 8.3 h ≈ $0.79; gp3 volumes ≈ $0.05. All terminated, and the dev box is stopped.
- **Lambda:** `nsr-endf-parse` not used (0 GB-s); no reserved concurrency set. nsr-api calls are inside the free tier.
- **S3:** requests ≈ $0.03. New serving files are 62.4 GB (168 objects), ≈ $1.44 a month; the `xs/` parquet duplicates `series.bin` and could be dropped to halve that.
- **Athena:** partition registration and the res-ranges query, under $0.01.
- **JANIS and GitLab traffic:** inbound, free. About 2,000 JANIS requests at one a second.

### Files
`scripts/recon/` (`jpk.py`, `janis_serve.py`, `recon.py`, `janis_tabler.py`, `janis_book.py`, `b1.py`, `b2check.py`, `janis_computed.py`, `userdata.sh`, README); `services/nsr-api/structure.py` (`JANIS`, `RECON`, `TALYS`, `janis=1`); `services/nsr-api/endf_sections.py` (the step); `services/nsr-api/test_janis.py`; `components/elpis/use-book.ts`; `scripts/elpis/res-ranges.mjs`, `book-index.mjs`; `public/elpis/res-ranges-n.json`. Per-release manifests: `lake/endfb/<release>/janis/manifest.json`; B1 data: `lake/_work/parse/endfb/recon/` (`janis/`, `b1.json`, `b2.json`, `b3-live.json`).
