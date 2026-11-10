# 57 — The sweep: every measured reaction against every evaluation; the retrodiction test; the VIII.1 list; flags with receipts; the medical-isotope routes (2026-11-10, overnight before launch)

You're `worker-3`. Written by `lead-agent` (Fable) from brief 55 (read it first). Launch is in the morning. This is the
night's main result: a ranked, reproducible comparison of the world's measured cross sections with the evaluated
libraries, which no public site holds, and a blind test that shows the ranking means something. Report to
`lead-agent` by SendMessage only, in Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`): one line per
part as it lands, the numbers in the report, one report at the end. No questions mid-job; decide, record the decision
in the manifest, continue. Message `worker-2` directly with each route's exact URL and an example answer the moment it
is live; they build the pages against it.

## Rules
1. Mac rules (8 GB Air): no `python3` locally; the AWS CLI one call at a time; nothing heavy downloaded. The sweep
   runs on a box (below), reached only through `scripts/iaea/box/ssm.sh`; scripts reach it through S3
   (`lake/_work/sweep/`), never pasted into SSM.
2. `~/Code/nsrgpt` on main, shared: `git pull --rebase --autostash origin main`, commit in one step with explicit
   paths, push right after. Never `git add -A`; never add another window's files. You own `scripts/sweep/**` (new),
   `services/nsr-api/sweep.py` (new) and its README rows and `MODULES` line, `lake/sweep/**`, `nsr.sweep_*`. Don't
   touch `app/`, `components/`, `lib/` (`worker-2`'s) or `scripts/parse/` (`worker-1`'s).
3. Copy the pattern, then adapt (EV rule 17): `lib/lab/canvases/compare.ts` is the arithmetic (interpolation on the
   evaluation's grid, log-energy bins, inverse-variance weighting, the MF33 band): port it to Python as it is, then
   extend. `scripts/parse/serve/points.py` shows DuckDB over the lake's Parquet with the box's credentials.
   `scripts/jobs/box/create.sh` and `userdata.sh` are the box pattern. `services/nsr-api/structure.py`'s `route` and
   `/endf/cov` are the route pattern.
4. Box: `scripts/sweep/box/create.sh nsr-sweep-1` on the jobs box's pattern, a `c7i.4xlarge` (16 vCPU, 32 GB, about
   $0.71 an hour) with a 100 GB gp3 root, role `nsr-jobs-box` (it already reads `lake/*`; add `lake/sweep/*` write to
   its policy and Athena/Glue for registration). DuckDB and pyarrow, numpy, scipy. Terminate it at the end. Spend cap
   $15 for the night; name a paid step and its price before taking it. No GPU unless a step needs one; nothing here does.
5. Every number you report comes from a table in the lake that a reader can query; every claim has its receipts (the
   subentries, the MATs, the energies). Nothing is rounded up. Where a step is approximate, the table says how.

## What the lake holds for this
- EXFOR points: `nsr.exfor_serve_points`, `lake/serve/exfor/2026-10-28/points/target_z=<Z>/points.parquet`: one row
  per data point, columns dataset, entry, subent, target_za, reaction (the EXFOR reaction field), sf6 (the quantity),
  source (C5 or J4), e_ev, de_ev, xs_b, dxs_b, units; 17.8 M points, 153,664 datasets. Datasets whose code combines
  reactions (ratios, sums) are already left out (`points.py`'s `combined_reaction_*`). The subentry's full record is
  `GET /exfor/subentry/{id}`; its NSR key is on the entry.
- Evaluations: `nsr.endfb_xs_points` (release, sublibrary, mat, mt, energy_ev, xs_barn, interpolation) for 13 releases
  plus the four POINT releases `B-VIII.1-point-0K`, `B-VIII.1-point-293.6K`, `B-VIII.0-point-0K`, `B-VIII.0-point-293.6K`
  (NNDC's POINT2025 and POINT2018: File 2 resonances reconstructed and Doppler-broadened, so the full cross section at
  every energy). `nsr.endfb_materials` maps (release, sublibrary, mat) to za. The plain releases' MF3 carries no
  resonance contribution below the unresolved range (File 2 holds it), so **the sweep's comparator for ENDF/B is the
  293.6 K POINT release** and for JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 the MF3 as held, used only above each
  material's resonance range (the ranges from `worker-1`'s `endfb_res_ranges` when it lands tonight; until then, above
  the energy where the evaluation's grid density falls under 50 points a decade, recorded per pair as
  `comparator_floor_ev` with its method). The uncertainty: `nsr.endfb_cov` (MF33; `/endf/cov` shows how the diagonal
  becomes a relative sd per group, copy its code).
- Fission yields `nsr.endfb_fy` (MT 454 independent, 459 cumulative; zafp, fps, yield, yield_unc per incident energy),
  decay `nsr.endfb_decay*`, ICRP 107 `nsr.icrp107_*` (nuclides, daughters, radiations).
- The Lab's compare: `lib/lab/canvases/compare.ts`; its demo number for U-235 (n,f) 9 to 18 keV at 300 K: B-VIII.1
  0.995, JEFF-3.3 0.976, JENDL-5 0.985 over 4,140 points and 69 datasets. Your sweep must reproduce it for that pair
  within 0.002 (same points, same bins) before it runs over everything.

## Part A: the sweep runner (`scripts/sweep/sweep.py`)
1. **Pairs.** `scripts/sweep/reactions.py` maps the EXFOR reaction field to (projectile sublibrary, MT): N→neutrons,
   P→protons, D→deuterons, T→tritons, HE3→helium3s, A→alphas, G→gammas; the process to MT by ENDF-6's table (TOT 1,
   EL 2, NON 3, N 4 (inelastic for neutrons, (z,n) otherwise), 2N 16, 3N 17, F 18, N+A 22, N+P 28, 4N 37, G 102,
   P 103, D 104, T 105, HE3 106, A 107, 2P 111, and the rest of chapter 0's list; residual-specific codes such as
   `(P,X)` map to nothing and are counted as "no MT"). Quantity SIG only (sf6 = SIG), `units == "B"`, no `-M`/`-G`
   state in the product when the evaluation's MT is a total (count those as `state_specific`, not compared: the
   evaluations' isomeric splits are MF8/MF10 and are not parsed). A pair is (target_za, sublibrary, mt). Write
   `sweep_pairs_all`: every pair with its EXFOR dataset count, point count, energy span, and whether each release
   holds the section. Report the counts: pairs with data, pairs with data and B-VIII.1, with B-VIII.0, with all four
   libraries.
2. **The comparison, per pair and release.** Port `compare.ts`: each point divided by the comparator at its energy
   (linear interpolation on the comparator's grid, null outside it); log-energy bins, 4 a decade, edges on round
   powers of ten; per bin the inverse-variance weighted mean of log(ratio) (weights from dxs_b where given, else the
   dataset's median relative uncertainty, else 10%, the choice recorded per point as `weight_source`), its standard
   error, the number of points and datasets, the evaluation's MF33 relative sd for the bin where held. Per pair and
   release the summary: n_points, n_datasets, n_bins, `mean_log_ratio` over bins weighted by points, `max_bin_dev`
   (the bin whose |mean log ratio| is largest, with its energy), `z` = |weighted mean log ratio| / sqrt(se² +
   rel_sd_eval²) (rel_sd_eval 0 where MF33 is absent, with `mf33: false`), `driver_dataset` (the dataset whose removal
   moves the mean most, with how much), `support` (points and datasets after removing the driver). Tables:
   `sweep_bins` (pair, release, bin, the numbers), `sweep_datasets` (pair, release, dataset, n, mean log ratio, its
   se), `sweep_summary` (pair, release, the summary). Parquet under `lake/sweep/2026-11-10/<table>/`, DDL in
   `scripts/sweep/ddl/`, registered in `nsr` as `nsr.sweep_<table>`.
3. **Comparators and releases:** `B-VIII.1-point-293.6K` (reported as B-VIII.1), `B-VIII.0-point-293.6K` (as
   B-VIII.0), JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2 (neutrons above the floor), and for charged particles and
   photons every sublibrary the libraries hold (TENDL-2023 p, d, t, he3, he4, g; JENDL-5 p, d, he4, g; JEFF-3.3 p, d,
   he3, a, g; B-VIII.1 and B-VIII.0 protons, deuterons, tritons, helium3s, alphas, gammas where present). The manifest
   lists per release which sublibraries were compared.
4. **Check** on U-235 (n,f) 9 to 18 keV against the Lab's numbers (above) before the full run; write the check into
   the manifest. Then run everything. Time it; the whole of EXFOR against six libraries should be minutes to an hour
   on 16 cores with DuckDB doing the joins; if it is heading past three hours, run neutrons first and report.
5. **Routes** in `services/nsr-api/sweep.py` (`MODULES` gets `"/sweep": "sweep"`; the Parquet read with pyarrow by
   row group as `/endf/cov` reads, or the summary table loaded once into memory, it is small): 
   - `GET /sweep?release=B-VIII.1&sort=z|mean|support&dir=desc&nuclide=U-235&mt=18&sub=neutrons&min_datasets=2&page=1`
     → `{ release, total, page, rows: [{ target_za, target, sublibrary, mt, reaction, n_points, n_datasets, n_bins,
     mean_log_ratio, mean_ratio, z, max_bin_dev, max_bin_e_ev, rel_sd_eval, mf33, driver_dataset, driver_effect,
     support_points, support_datasets, comparator, comparator_floor_ev, lab: { target, reaction, mt, emin, emax,
     releases } }] }`, 100 rows a page; `lab` is what `worker-2` opens the Lab canvas with.
   - `GET /sweep/pair?target=U-235&mt=18&sub=neutrons&release=B-VIII.1,JEFF-3.3` → the bins and the per-dataset
     table for the pair, every release asked.
   - `GET /sweep/releases` → the releases, sublibraries and counts, the run date, the method text.
   README rows with example URLs. Deploy from the dev box as before (`services/nsr-api/README.md`, "Packages and
   build"). Latencies in the report.

## Part B: the retrodiction (the blind test)
1. **What changed VIII.0 → VIII.1:** per (za, sublibrary, mt) held in both, from `endfb_xs_points` B-VIII.0 and
   B-VIII.1 (the plain releases, MF3; and the two POINT 293.6 K releases where the pair's data sits in a resonance
   range): on a common log grid (20 points a decade over the pair's EXFOR energy span), the RMS of log(σ_VIII.1 /
   σ_VIII.0) and the max |log ratio|; `changed` when the RMS exceeds 0.005 (half a percent; record the threshold and
   also store the RMS so a reader can move it). Table `sweep_changes` (pair, rms_log, max_log, changed, span).
2. **The ranking on VIII.0:** `sweep_summary` for B-VIII.0, pairs with support (at least 2 datasets and 20 points
   after removing the driver), ranked by z descending; also ranked by |mean_log_ratio|.
3. **The test:** for the top 10, 20, 50, 100 and 200 of each ranking, the fraction `changed`, against the base rate
   (the fraction changed among every pair with support); the enrichment (fraction / base rate); and the direction:
   among the changed pairs in the top N, the fraction where VIII.1 moved toward the data (|mean_log_ratio| on
   VIII.1 smaller than on VIII.0). Also the other way round: of every changed pair with support, where did the
   ranking put it (the median rank, the fraction in the top decile). Table `sweep_retrodiction` (rank, pair, z,
   mean_log_ratio_v80, mean_log_ratio_v81, changed, rms_log, moved_toward_data) and a `summary` JSON with every rate.
   Report the top-20 hit rate, the enrichment and the direction rate as three numbers in one line, then the table.
4. Route `GET /sweep/retrodiction` → `{ summary, rows }` (the ranked table, 500 rows).

## Part C: the VIII.1 list and the flags with receipts
1. **The list:** `sweep_summary` for B-VIII.1 ranked as in B.2, with the same support rule, and a second list of the
   pairs a single dataset drives (support fails but one dataset disagrees by more than 3 z): those are either a bad
   evaluation or a bad dataset, and the page says which it can't tell. Route: `/sweep?release=B-VIII.1` is the list;
   `&single=1` the second.
2. **Not on USNDP's list:** fetch from the box what is public: the ENDF/B-VIII.1 release paper's and release notes'
   list of changed and known-issue materials (NNDC's ENDF/B-VIII.1 page at nndc.bnl.gov/endf-b8.1/ and its
   `ENDF-B-VIII.1-release-notes`, the CSEWG issue tracker if public at git.nndc.bnl.gov or on GitHub under
   `nndc`/`csewg`, the IAEA CIELO and WPEC subgroup evaluation lists), save the pages under
   `lake/sweep/2026-11-10/public-lists/` with their URLs and fetch times, and extract the (material, reaction) pairs
   they name into `sweep_public_list` (source URL, za, mt or "all", the note). If a source is not public or the box's
   network refuses it, say so in the manifest and the report; don't guess its contents. Then `sweep_flags`: every pair
   in the VIII.1 list's top 200 not named by any public list, with its receipts: the z, the datasets (subentry ids,
   authors, years), the bin and energy of the largest deviation, the MF33 sd if held.
3. **Mislabelled EXFOR:** `sweep_exfor_flags`, one row per dataset, from three rules, each row naming the rule:
   (a) `units` not barns for SIG (σ√E, no-dim, mb mis-scaled: the units value and the dataset's median ratio to every
   evaluation); (b) a dataset whose median ratio to every evaluation held is outside [0.1, 10] while the other
   datasets of the pair sit inside [0.5, 2] (a factor-of-1000 or 10 off: a unit or label slip, with the factor);
   (c) a dataset whose energies fall entirely outside every evaluation's span for that MT by a decade (an energy-unit
   slip). Each with subentry, entry, author, year, the pair, the numbers, the EXFOR record URL. Route
   `GET /sweep/flags` → `{ evaluation: [...], exfor: [...] }`; `?kind=exfor&rule=b` filters.
4. Report the sizes: the VIII.1 list, the single-driver list, the public-list pairs found and the sources that were
   not reachable, the flags, the EXFOR flags per rule.

## Part D: the medical-isotope routes (the sweep, sliced, with the yield)
Every production route below is a pair (or a chain of pairs and a decay) the sweep already compared; this part adds
the production number per route from each evaluation and from the data, and the spread between them.
1. **Routes** in `scripts/sweep/medical.py`, a table with target, projectile, MT, product, the route's chain where the
   product is a daughter (the decay from `icrp107_daughters` or `endfb_decay_modes`), and the irradiation: reactor
   (thermal Maxwellian at 293.6 K plus a 1/E epithermal tail, cadmium cut 0.5 eV; report the thermal cross section
   and the resonance integral per evaluation and from EXFOR's MXW and RI points), cyclotron (a proton, deuteron or
   alpha beam at the energies the IAEA medical pages list for the route), or photon (bremsstrahlung endpoint 30 and
   40 MeV, a flat spectrum above threshold as the simplest honest shape, named as such). Routes: Mo-99 from
   U-235(n,f) (MT 18 × the cumulative yield of Mo-99 from `endfb_fy` MT 459 at thermal, per release), Mo-98(n,γ),
   Mo-100(γ,n); Tc-99m from Mo-100(p,2n); Lu-177 from Lu-176(n,γ) and Yb-176(n,γ)Yb-177→Lu-177; Ac-225 from
   Ra-226(p,2n), Ra-226(γ,n)Ra-225→Ac-225, Th-232(p,x) (TENDL p where MT 5 residuals are not parsed: say "not held
   as a cross section" and skip); Ac-227/Ra-223 from Ra-226(n,γ); Cu-67 from Zn-68(γ,p), Zn-70(p,α), Zn-68(p,2p);
   Ga-68 from Zn-68(p,n); Ge-68 from Ga-69(p,2n); I-131 from Te-130(n,γ) and U-235(n,f) (yield of I-131); Y-90 from
   Y-89(n,γ) and the Sr-90 yield; Sm-153 from Sm-152(n,γ); Re-188 from W-186(n,γ)W-187 and W-187(n,γ); Sr-89 from
   Sr-88(n,γ) and Y-89(n,p); Cu-64 from Ni-64(p,n); Zr-89 from Y-89(p,n); F-18 from O-18(p,n); Pb-212 and Tc-99m
   generators are decay only (list with the parent's half-life from ICRP 107 and no cross section).
2. **IAEA recommended curves:** the IAEA medical isotope cross-section pages (www-nds.iaea.org/medical/, the
   therapeutic, diagnostic, monitor and gamma pages) publish recommended cross sections as text tables per
   reaction. Fetch what the box can reach into `lake/sweep/2026-11-10/iaea-medical/` with URLs; parse into
   `sweep_medical_recommended` (route, e_ev, xs_b, dxs_b). Where a fetch fails, the route says `iaea: not reached`.
3. **The yield:** for cyclotron routes the thick-target yield Y(E_in → E_out) = N_A ρ/M ∫ σ(E)/S(E) dE, with the
   stopping power S(E) from the Bethe formula with ICRU 37 mean excitation energies (a table of I per element in
   `medical.py`, values cited to ICRU 37; no shell or density corrections, the method named), in MBq/µAh at
   saturation using the product's half-life from ICRP 107. The lake holds no SRIM or PSTAR table; say so. For
   reactor routes the production per gram per hour at 1e13 n/cm²/s thermal with epithermal ratio 1:40 (named as the
   assumed spectrum), from the thermal cross section and resonance integral. For photon routes the yield per unit
   photon fluence integrated over the flat spectrum above threshold. Each per evaluation, per the IAEA curve where
   held, and from the EXFOR data (the inverse-variance weighted mean ratio applied to the best evaluation's curve,
   with the data's spread). Table `sweep_medical_routes` (route, product, target, projectile, mt, irradiation,
   per-evaluation yield and its MF33-propagated uncertainty, the data-derived yield and its spread, the spread across
   evaluations as a percent, `verdict`: "evaluations agree within the data" or "evaluations disagree beyond the
   data's spread" with the numbers) and `sweep_medical_points` (route, source, e_ev, xs_b, dxs_b) for the chart.
4. Routes: `GET /sweep/medical` → the routes table; `GET /sweep/medical/{route}` → the route with its points by
   source (EXFOR by dataset, each evaluation, IAEA), the yield table, the bins and the verdict. Tell `worker-2` the
   shapes as they land.
5. Report: one line per route: product, route, spread across evaluations in percent, data spread in percent, verdict.

## Part E: register and record
`lake/sweep/2026-11-10/manifest.json`: every table's rows and bytes, the method text (one paragraph per part, plain
language, the thresholds and assumptions), the public lists fetched and not, the IAEA pages fetched and not, the
U-235 check, timings, spend. `INVENTORY.md` (the S3 object at the bucket root: download, edit, upload) rows for
`lake/sweep/`. `scripts/sweep/README.md`: how to rerun the whole sweep in one line on a fresh box, and that it is
rerun the day a library changes.

## Done means
Tables registered and served; the U-235 check in the manifest; the retrodiction's three numbers reported with the
table; the VIII.1 list, flags and EXFOR flags served; the medical routes served with a yield and a verdict each;
`worker-2` told every route; scripts, DDL, README, manifest committed and pushed; the box terminated; spend in the
manifest; one final report to `lead-agent` with every URL, every count, the three retrodiction numbers, the top ten
of the VIII.1 list, the routes' verdicts, what was left out and why.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/57-sweep-retrodiction-flags-medical.md and do it; report to lead-agent after each part; tell worker-2 each route as it lands.`
