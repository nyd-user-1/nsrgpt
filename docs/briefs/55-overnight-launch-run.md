# 55 — The overnight run before launch (2026-11-10, written 03:45 ET by lead-agent; starts on Brendan's "go")

Launch is tomorrow morning. Brendan reviews every item's UI on the dev box or production when he wakes. This is the
lead's own note across a context compaction and the plan the windows work from. Windows: `worker-1`, `worker-2`
(on brief 54 now: charts' panels and legends off the canvas, 3D marks and pan, Camera keys, "Decay chain"), `worker-3`.
Dev box `i-0ec4775a5cd68d41b` at http://3.133.98.108:3000 (stops itself about 07:10 ET; `scripts/devbox/launch.sh start
i-0ec4775a5cd68d41b` restarts it and prints the new address). Job box `nsr-jobs-1` (`i-087b78cc95cce48c8`) is stopped;
nsr-jobs starts it on demand. Production: https://nsrgpt.brendan-stanton.workers.dev, deployed by CI on every push.
Rules as always: Mac rules, explicit-path commits, type-check on the box, EV reports, no questions to Brendan overnight.

## What Brendan ordered, in his words and mine
1. **File 2 and File 32** (ENDF resonance parameters, LRF 1, 2, 3 and 7, and their covariances) parsed for all 13 releases
   and the four libraries, into `endfb_*` tables; served per material; the Lab's and the sweep's uncertainty band below the
   unresolved range reconstructed from them (PREPRO `recent` already does the reconstruction on the job box). The format
   is in ENDF-367 (`~/Downloads/ENDF-367.pdf`, SAMMY's guide to File 2 and 32) and ENDF-102. Parser lane: `worker-1`.
2. **The sweep.** Every (nuclide, reaction) pair with measurements and an evaluation, the Lab's Compare over all of them:
   EXFOR points (barns only, the mislabelled excluded) against each evaluation, broadened where the box can, bins per decade,
   the ratio and the disagreement in units of the stated uncertainty (EXFOR's and MF33's), the datasets driving each entry.
   2a. **Retrodiction first:** ENDF/B-VIII.0 against EXFOR, ranked; then the diff VIII.0 → VIII.1 per section from our own
       `endfb_xs_points` (both releases are parsed); the blind check is whether the ranking's top entries are the sections
       VIII.1 changed. Report the hit rate.
   2b. **VIII.1 list:** the same sweep on VIII.1, ranked: the list that doesn't exist.
   2c. **Flags with receipts:** VIII.1 entries not on USNDP's own list (their public to-do is the CSEWG/ENDF GitLab issues and
       the NNDC "ENDF/B-VIII.1 known issues" page; fetch what is public, say what isn't), plus every EXFOR dataset our rules
       caught as mislabelled (ratios, σ√E, unit mismatches), each with its subentry.
   Runs on the job box pattern (CPU; a GPU box only if a step needs it), results as tables in `lake/sweep/<release>/`,
   registered in `nsr`, served by nsr-api. Lane: `worker-3` (the runner and tables), `worker-2` the page once Part B of 54 is in.
3. **Cancer therapy, the earth-shattering ask:** "anything within reach, backed by data and a reproducible process, that no
   scientist could refute." My pick: the medical-isotope slice of the sweep, done properly. For every production route the
   IAEA medical isotope portal lists (Ac-225 from Th-229/Ra-226/Th-232 routes, Lu-177 from Lu-176(n,γ) and Yb-176(n,γ)β−,
   Mo-99 from U-235(n,f) and Mo-98(n,γ) and Mo-100(γ,n), Cu-67, Ga-68/Ge-68, I-131, Tc-99m, Y-90, Ra-223, Sm-153, Re-188,
   Sr-89, Pb-212): every EXFOR measurement of the route's cross section against every evaluation (TENDL-2023, ENDF/B-VIII.1,
   JENDL-5, JEFF-3.3, IAEA's recommended curve where held), the spread between them, and the thick-target yield per
   irradiation computed from each (stopping powers from the lake's SRIM/ASTAR-PSTAR holdings if present, else NIST's
   formulae), so the yield's uncertainty is a number per route. Where the evaluations disagree by more than the data's
   spread, that is a route whose production planning rests on a guess, named with its receipts. A page per route, a table
   over all, reproducible from the canvas. Lane: `worker-3` after the sweep runner exists (it is the sweep sliced), the page
   by `worker-2`.
4. **UI for the morning review:** `/sweep` (the ranked table, filters by release, nuclide, reaction, driver; a row opens a
   Lab canvas built for that pair), `/sweep/medical` (the routes), `/nsrcpt` (below), `/about` (below). Each a static shell
   reading the API.
5. **Site admin:** `brendan@nysgpt.com` as the site admin: create the user in the `nsrgpt` Cognito pool (admin-created;
   self sign-up stays off, Brendan has not said otherwise), a temporary password put in SSM `/nsrgpt/admin/first-password`
   (SecureString, tell him the parameter, never the value), and `admin: true` in `components/shell.tsx` when the signed-in
   email is in an `NSRGPT_ADMIN_EMAILS` env (Worker secret and the box's service), replacing the hard-coded false.
   Lane: `worker-1` (it knows the pool from brief 45), first thing.
6. **The layers, nothing lost, outstanding tasks finished** (the table from 03:00 ET): Parsed: File 2 and 32 (item 1), MF4
   to 6, MF9 to 15 counted and registered at least as sections, POINT above 293.6 K if the box has hours; Serving: routes for
   the MF8 tables (fission yields, decay data) and ICRP 107 (nuclide, radiations, chain), `/nuclide/{name}` carrying them;
   Catalog: INVENTORY rows and the data dictionary for every new table; API: README rows; Search: ICRP nuclides and the four
   libraries' decay and yield records in `search_docs_structure`; UI: the four libraries in every release picker, /pipeline
   and lake-page counts updated, the data dictionary's `held` note fixed. Lane: `worker-1` after items 1 and 5.
7. **/nsrcpt:** the original nsr app's NSR-CPT page is `~/Code/nsr/src/pages/Announcing.tsx` (with `useNsrSearch.ts` and
   `ScoreInfoDialog.tsx` beside it). Port it whole (EV rule 17), in the paper palette and the app shell, as `/nsrcpt`, then
   add a "Coming soon" section at the foot: the fine-tuned models in `lib/home-data.ts` (nsr-encoder, nsr-reranker and the
   family at huggingface.co/NYSgpt) as cards marked coming soon where not yet served. Sidebar row, header title, plate box.
   Lane: `worker-2` after brief 54.
8. **/about:** who the application is for (evaluators, experimenters, reactor and medical physicists, students; the
   USNDP/NNDC/IAEA-NDS community) and what it does (the lake by layer with live counts, the chart, the graph, the Lab, the
   sweep, chat with citations), in the first person singular as the app speaks, plain language, the paper palette, no
   captions that restate the layout. Lane: `worker-2`.
9. **Also open:** EV rule 28 edit uncommitted in `docs/sketches/2026-11-06-efficiency-voice.html` (Brendan commits it);
   three uncommitted chart files from another window (`app/(site)/viz/matrix/chart.tsx`, `viz/structure/chart.tsx`,
   `viz/structure/view.tsx`) — find out whose and finish or revert; the BNL email draft for David Brown (lead writes it
   once 2a's hit rate is in); the Cognito self sign-up decision (parked).

## Order and parallelism
- `worker-1`: item 5 (admin, 20 min) → item 1 (File 2 and 32) → item 6.
- `worker-3`: item 2 (sweep runner, 2a, 2b, 2c, tables and routes) → item 3 (medical slice).
- `worker-2`: brief 54 → item 4's pages as the data lands (`/sweep`, `/sweep/medical`) → items 7 and 8.
- lead: briefs 56 (File 2/32 + layers), 57 (sweep + medical), 58 (pages) from this note on "go"; reviews each report; the
  morning report as brief 59 with every URL to look at; the BNL draft; commits nothing of Brendan's.

## Morning report must list
Each item's URL on production and the box; the sweep's retrodiction hit rate; the VIII.1 list's size and top ten; the
mislabelled EXFOR count; the medical routes' yield uncertainties; what was left out and why; spend; the layers table.
