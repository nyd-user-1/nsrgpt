# 59 — Morning report, 2026-11-11 (the overnight run before launch, brief 55)

Brief 55's "Morning report must list": each item's URL on production and the box; the sweep's retrodiction hit rate;
the VIII.1 list's size and top ten; the mislabelled EXFOR count; the medical routes' yield uncertainties; what was left
out and why; spend; the layers table. Each window appends its own section.

Production: https://nsrgpt.brendan-stanton.workers.dev · Dev box: http://3.133.98.108:3000 (stops itself about 07:10 ET;
`scripts/devbox/launch.sh start i-0ec4775a5cd68d41b` restarts it and prints the new address).

## worker-2 (UI: briefs 54 and 58, the chat sign-up)

Every page below was type-checked and linted on the dev box before its push and checked there in light and dark.

| Page | Production | Box | Commit |
| --- | --- | --- | --- |
| Chart of nuclides: Colour by, legend and nuclide card in the right panel; 2× hovered and picked cell | /viz/chart | /viz/chart | f7b1a1c |
| Panels off the canvas: structure, matrix, spectra; decay and 3D graph legends | /viz/structure, /viz/matrix, /viz/spectra | same | 3ebe150 |
| 3D charts: Camera keys in the right panel, pan (Shift or Option + arrows, and the caps), 4× picked point | /viz/scatter3d-dataset, /viz/decay, /viz/graph | same | 51d94ad |
| "Decay chain" for "Decay family" (5 reader-facing strings) | /viz/chart | same | 7611248 |
| NSR-CPT, the model's page | /nsrcpt | /nsrcpt | f61c636, 92b5e3b |
| About | /about | /about | 8472322, acb8e18 |
| Sweep: ranked list, Retrodiction, Flags; pair in the second panel; Open in the Lab | /sweep, /sweep/pair | same | 5842ea4, acb8e18 |
| Medical isotope routes and a page per route | /sweep/medical, /sweep/medical/{route} | same | acb8e18 |
| ICRP 107 half-lives against ENSDF (1,246 rows, live) | /sweep/icrp | same | acb8e18 |
| GNDS 2.0 download on an ENDF/B record (precompiled, or compiled on demand through a job), and a GNDS row on the lake card | /datasets/endf/B-VIII.1/9228, /pipeline | same | a552f3c, ccf0cde |
| Compile your own ENDF-6 file to GNDS 2.0 (signed in, up to 50 MB) | /datasets/endf | same | dd62f60 |
| The Lab: a projectile on the ENDF and covariance blocks, POINT temperatures to 1800 K, File 32's band where MF33 is empty; Open in the Lab for every sweep pair and medical route | /lab | same | e522f34, 8d17252 |
| Retrodiction over five release pairs, side by side | /sweep?tab=retrodiction | same | 6863f0e, 9ca3700 |
| Nuclide card links its fission yields, decay data and ICRP 107 record | /viz/chart?nuclide=235U | same | 8d17252 |
| Chat for a signed-out reader: my sign-up message, then the sign-up dialog, then the kept question | /chat | /chat (tested with a 402 answered in Playwright; the box runs NYSGPT_CHAT_OPEN=1) | 8b426f9 |

What it needs from you:
- Hugging Face: every NYSgpt model repo but the two 44b ones answers 401 (private), the NSR pair included, so the
  /nsrcpt cards' links 404 for a visitor. Making them public, or not, is yours; the cards stay as they are.
- The chat's sign-up dialog succeeds on production once worker-1's Cognito change (self sign-up) is live; I did not
  submit a real sign-up on the box (it spends the day's allowance).

Left out, and why:
- /sweep reads worker-3's live routes since 84dc362: 621 supported VIII.1 pairs (first Pd-108 (n,α), z 23.2), the
  retrodiction's top 20 at 25% changed (0.8× the 33% base rate, all five moved toward the data), 113 VIII.1 entries no
  public list names, 127 EXFOR datasets flagged. /sweep/pair draws each dataset's points (the route gives up to 300 a
  dataset), with its band and bin means.
- /sweep/medical reads the live routes since 28b535b: 28 routes, a page each with the yields per source, the EXFOR
  points, the IAEA curve and the evaluations, the verdict and the stopping-power check. The figures are in worker-3's
  section below.
- Open in the Lab works for every projectile since e522f34: the Lab's ENDF and covariance blocks take a projectile
  (sent as the API's `sub`). The pair's canvas has no Broaden block, so opening a pair never starts a job on the job
  box; add a Process block to broaden (neutrons only).
- Kept on the charts by decision: hover readouts that ignore the pointer (decay, 3D graph, knowledge) and the ECharts
  zoom sliders. Nothing a reader operates sits over a chart.
- Found and fixed on the way: /viz/matrix had been colouring every cell by its pair's row number, not by r.
- /viz/decay logs 19 React "synchronously unmount a root" warnings on load; main logs the same 19, so they predate this
  work.

## worker-3 (the sweep, the retrodiction, the flags, the medical routes: brief 57)

**The finding (replicated on two release pairs).** Ranking every section by how far the evaluation sits from the
measurements predicts which sections the next ENDF/B release revises at the measured energies. Universe: every
(target, reaction) with at least two EXFOR datasets of any year, flagged datasets left out, both releases from POINT
293.6 K (B-VII.1 reconstructed with PREPRO for this). Revised: the change at the data, |weighted mean ln(σ_new/σ_old)|,
exceeds one data uncertainty (sqrt(se² + MF33 sd²)).

| Release step | Sections | Revised (base) | AUC of the old release's disagreement score | One-sided Mann–Whitney p | Precision at 50 |
| --- | --- | --- | --- | --- | --- |
| VII.1 → VIII.0 | 1,018 | 36 (3.5%) | 0.672 | 2.3 × 10⁻⁴ | 0.08 (2.3× base) |
| VIII.0 → VIII.1 | 1,075 | 52 (4.8%) | 0.702 | 4.3 × 10⁻⁷ | 0.10 (2.1× base) |

Not an artefact of data precision (score and change share that denominator): within each third of the data's precision
the AUC stays 0.72 / 0.74 / 0.57 and 0.86 / 0.72 / 0.60; and with a precision-free definition (a change of more than 5%
at the data), the plain size of the disagreement gives AUC 0.695 (p 1.8 × 10⁻⁷) and 0.664 (p 7.0 × 10⁻⁶), while precision
alone gives 0.33 and 0.38. Of the revised sections in each top 50, 3 of 4 and 5 of 5 moved toward the data. A five-feature
L2 logistic (the score, the distances from JEFF-3.3 and JENDL-5, the change history, the dataset count) does worse
(AUC 0.63) and the full boosted model overfits (0.60); the score is the result. Served at
`/sweep/retrodiction?method=v3` (and `confound-check.json`); the VIII.2 ranking by the score is frozen, dated, in
`lake/sweep/2026-11-10/prediction-viii2.json` for the forward test.

**The predictor around it (v3; trained on VII.1 → VIII.0, tested blind on VIII.0 → VIII.1; AUC on the held-out step).**

| Unit | Model or feature | n test (revised) | AUC | Precision at 50 | Note |
| --- | --- | --- | --- | --- | --- |
| Section | the disagreement score alone | 1,075 (52) | 0.702 | 0.10 | p 4.3 × 10⁻⁷; on the training step 0.672, p 2.3 × 10⁻⁴ |
| Section | one L2 logistic, 5 features (score, JEFF and JENDL distances, change history, log datasets) | 1,075 (52) | 0.630 | 0.10 | train AUC 0.68 |
| Section | gradient boosting, all features | 1,075 (52) | 0.601 | 0.20 | overfits (train 1.00) |
| Section | logistic, all features | 1,075 (52) | 0.553 | 0.08 | overfits (train 0.91) |
| Section | single features: JEFF distance / change history / NSR papers / new-data score | 1,075 (52) | 0.62 / 0.58 / 0.56 / 0.54 | | |
| Material | the largest section score | 329 (39) | 0.695 | 0.24 | p 3.7 × 10⁻⁵; training step 302 (23), 0.671, p 0.003 |
| Material | one L2 logistic: score, years since evaluation, MF33 held, NSR evaluation papers, mentions in window | 329 (39) | 0.710 | 0.26 | beside the score, not instead |
| Material | single: NSR evaluation papers / public mentions in window / years since evaluation / MF33 held | 329 (39) | 0.64 / 0.61 / 0.61 / 0.44 | | File 1's "revised" count: 0.55 (0.78 on the training step) |
| Section within revised materials | the score | 178 (51) | 0.694 | | training step 105 (36): 0.736 |

Public mentions (`nsr.sweep_public_mentions`, 1,189 rows from 373 documents: CIELO 701, INDEN 232, NNDC VIII.1 notes 89,
GitHub 167; 503 dated by the nearest year in the text) come from the lake's mirror of the IAEA INDEN and CIELO pages; the
live IAEA and NEA WPEC pages answer HTTP 403 from both boxes (a browser user agent included), CSEWG publishes no minutes at
nndc.bnl.gov/csewg/ (404) and its GitLab needs a login. The NSR "evaluation paper" feature in the models uses a broad
pattern (evaluat, R-matrix, resonance analysis, ENDF) that also matches comparisons with evaluated data.

**Orphans** (`/sweep/flags?kind=orphan`, `nsr.sweep_orphans`): 73 sections in the VIII.1 ranking's top 300 with no public
mention, no NSR paper since 2018 that does an evaluation (R-matrix, resonance analysis, evaluated σ or resonance
parameters, a new evaluation) and no change at the data in the last two releases, each with its datasets. Among the 300:
164 have a mention, 127 an evaluation paper, 291 a comparison paper ("compared with", "disagree"), 79 a recent change;
7 have none of the four. First: Pd-108 (n,α) and Pd-106 (n,α) at 13 to 15 MeV, measured 3.2 and 2.5 times the
evaluation, unchanged since VII.1. The VIII.2 rankings are frozen in `prediction-viii2.json`: by the score (sections),
by the material score with the small logistic's probability (materials), and the boosted model (its sha256 and pickle).

API base https://daw1qggkn69lv.cloudfront.net (CloudFront, an hour's cache); origin https://3o2ps7jan4.execute-api.us-east-2.amazonaws.com.
First call after a cold start 3.5 to 4.5 s (the tables load), then 0.2 to 0.7 s; `/sweep/pair` with points 1.1 to 1.5 s.

| Route | What |
| --- | --- |
| `/sweep?release=B-VIII.1` | the VIII.1 list: 621 supported pairs ranked by z (`&single=1`: 343 pairs one dataset drives; `&all=1`: every pair) |
| `/sweep/pair?target=U-235&mt=18&sub=neutrons` | bins, datasets and each dataset's points per release |
| `/sweep/retrodiction` | the VIII.0 ranking against what VIII.1 changed, with the rates by threshold |
| `/sweep/flags` | 113 VIII.1 entries no public statement names; 127 EXFOR datasets flagged |
| `/sweep/medical`, `/sweep/medical/{route}` | 28 production routes, a yield per evaluation, per the IAEA curve and from the data, and a verdict |
| `/sweep/releases` | the manifest: method, counts, the U-235 check, sources reached and not, spend |

Tables: 14 `nsr.sweep_*` tables in `lake/sweep/2026-11-10/` (pairs_all, summary, bins, datasets, points, changes,
retrodiction, single, flags, exfor_flags, public_list, medical_routes, medical_points, medical_recommended, plus
`manifest.json`, `public-lists/`, `iaea-medical/`). Scripts and the one-line rerun: `scripts/sweep/README.md`.

**The retrodiction, direction first.** Where VIII.1 changed a pair the VIII.0 ranking put near the top, VIII.1 moved
toward the measurements: 5 of 5 changed pairs in the top 20, 13 of 14 (93%) in the top 50, 70% in the top 200, against
60% for all 204 changed pairs. The ranking does not predict which pairs VIII.1 changed: top-20 hit rate 25% against a
32.8% base rate (enrichment 0.76; 622 supported pairs, 204 changed at an RMS of 0.5%), changed pairs' median rank 318
of 622. At stricter thresholds (2, 5, 10%: re-evaluations, not grid changes) the top-50 enrichment is 1.05, 1.17, 1.18,
within chance on 10 to 15 hits; the direction rate stays 89 to 93% in the top 50 at every threshold. It does not
replicate on the older release pairs (VII.1 to VIII.0, VII.0 to VII.1; table below): against the 60% base it is
significant for VIII.0 to VIII.1 only (13 of 14, one-sided binomial p about 0.008).

**The U-235 check** reproduces the Lab on the same 4,140 points and 69 datasets: B-VIII.1 0.9949 (Lab 0.995), JEFF-3.3
0.9755 (0.976), JENDL-5 0.9851 (0.985).

**The VIII.1 list's top ten** (measured over evaluated): Pd-108 (n,α) 3.24 (z 23.2), P-31 (n,2n) 0.42, Yb-174 (n,p) 0.70,
Sr-86 (n,tot) 0.92, Ru-96 (n,2n) 0.76, Tl-205 (n,tot) 1.90, Sc-45 (n,α) 1.28, S-34 (n,tot) 1.71, Cd-111 (n,p) 0.49,
Tm-169 (n,tot) 0.92. The threshold reactions sit at 13 to 15 MeV with 7 to 15 datasets each; none has MF33 in VIII.1.

**Flags.** 113 of the VIII.1 list's top 200 are named by no public statement the box could read (NNDC's VIII.1
descriptions and metadata name about 40 nuclides; GitHub issues mentioning VIII.1 were counted as named, the
conservative reading). EXFOR: rule a (`,SIG` in units not barns) 1, rule b (a factor of 10 or 1000 off while the
pair's other datasets agree) 22, rule c (energies a decade outside every evaluation) 104; each with its subentry and
the IAEA EXFOR link.

**Medical routes** (evaluation spread / data spread over datasets; data-derived yield's standard error; the evaluations'
MF33 relative sd, propagated through the yield):

| Product | Route | Spread, evaluations | Spread, data | Data se | MF33 sd | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Mo-99 | U-235(n,f) × cumulative yield | 0.8% | 2.1% (44) | 1.6% | 0.6–1.5% | agree |
| Mo-99 | Mo-98(n,γ) | 6.2% | 14.1% (22) | 3.1% | 4.2–4.6% | agree |
| Mo-99 | Mo-100(γ,n) | 15.5% | 7.8% (2) | 7.8% | 30–34% | disagree |
| Tc-99m | Mo-100(p,2n) | – | 13.6% (12) | 4.1% | 14–26% | evaluations hold only the total (p,2n) |
| Lu-177 | Lu-176(n,γ) | 3.0% | 7.3% (8) | 2.8% | ≤2.5% | agree |
| Lu-177 | Yb-176(n,γ)Yb-177 | 1.6% | 7.2% (6) | 3.2% | ≤3.8% | agree |
| Ac-225 | Ra-226(p,2n) | 11.8% | 19.5% (3) | 13.8% | 29% | agree |
| Ac-225 | Ra-226(γ,n)Ra-225 | 17.1% | – | – | 44% | no EXFOR data |
| Ac-225 | Th-232(p,x) | – | 21.9% (8) | 8.3% | – | no evaluation holds it as a cross section |
| Ac-227 / Ra-223 | Ra-226(n,γ) | 5.9% | 22.6% (8) | 8.6% | ≤3.2% | agree |
| Cu-67 | Zn-68(γ,p) | 11.7% | 17.4% (1) | 17.4% | 62–119% | agree |
| Cu-67 | Zn-70(p,α) | 3.2% | 16.4% (1) | 16.4% | 37–164% | agree |
| Cu-67 | Zn-68(p,2p) | – | 33.5% (5) | 16.7% | – | fewer than two evaluations |
| Ga-68 | Zn-68(p,n) | 3.8% | 14.3% (20) | 3.3% | 6–20% | agree |
| Ge-68 | Ga-69(p,2n) | 21.1% | 15.2% (4) | 8.8% | 24–44% | disagree |
| I-131 | Te-130(n,γ) | 8.8% | 10.2% (8) | 3.9% | ≤18% | agree |
| I-131 | U-235(n,f) × cumulative yield | 3.5% | 14.6% (44) | 10.3% | 0.6–1.6% | agree |
| Y-90 | Y-89(n,γ) | 0.7% | 1.5% (8) | 0.8% | TENDL's up to 12× | agree |
| Y-90 | Sr-90 yield (generator) | 2.2% | 4.2% (42) | 3.9% | 0.6–2.4% | agree |
| Sm-153 | Sm-152(n,γ) | 1.9% | 3.2% (17) | 0.8% | ≤4.6% | agree |
| Re-188 | W-186(n,γ)W-187(n,γ) | 42.6% | 6.3% (27) | 1.2% | ≤5.2% | disagree |
| Sr-89 | Sr-88(n,γ) | 57% | 238% (6) | 106% | ≤6% | data too scattered to judge |
| Sr-89 | Y-89(n,p) | 38% | 70% (9) | 25% | 17–139% | data too scattered to judge |
| Cu-64 | Ni-64(p,n) | 0.2% | 16.5% (12) | 5.0% | 10–21% | agree (TENDL and JEFF only; JEFF's protons are TENDL's) |
| Zr-89 | Y-89(p,n) | 5.8% | 52% (10) | 17.5% | 11–20% | data too scattered to judge |
| F-18 | O-18(p,n) | 3.6% | 12.8% (6) | 5.7% | 20–22% | agree |
| Pb-212, Tc-99m | generators | – | – | – | – | decay only |

The cyclotron yields now use the IAEA measured proton stopping powers (worker-4's `nsr.stopping_powers`, as a
correction to Bethe, each measurement over Bethe at the element's natural weight, the median per quarter-decade bin),
with Bethe the named fallback where no measurement reaches (Ra, Th, and Zn above 30 MeV); both methods' yields are in
`nsr.sweep_medical_yields` and `/sweep/medical/{route}`'s `yields_by_method`. The move is +0.8 to +3.7% (Bethe without
shell corrections overstates the stopping). Against the IAEA's own published thick-target yields on the IAEA curves the
check tightens from 0.965–0.993 to 0.995–1.011 (mean deviation 2.2% to 0.4%): Ni-64(p,n) 0.967 → 0.995, Zn-70(p,α)
0.984 → 1.002, Ga-69(p,2n) 0.993 → 1.001, Mo-100(p,2n) 0.983 → 1.011, Y-89(p,n) 0.965 → 1.001; Th-232(p,x) 1.002 and
Zn-68(p,2p) 0.992 stay on Bethe. Ra-226(p,2n) does not settle: no Ra measurement exists, and the two methods differ by
at most 4% everywhere else, so its 1.358 is not a stopping-power effect; the IAEA page does not state the target its
yield assumes (a compound target such as RaCl2 would lower its figure by a factor of this order, about 1.5 by Bragg
additivity), so it stays open. Verdicts are unchanged.

**Left out, and why.** EXFOR datasets with a level or isomer in the product (5,051: the evaluations' isomeric splits are
MF8/MF10, not parsed); quantity modifiers (35,729: Maxwellian, spectrum-averaged, relative, raw, derived, partial; the
search index drops SF8 and SF9, so they are read from the code); EXFOR's V area (2,409 evaluated compilations); residual
production (X, MT 5 with MF6 yields); specific MTs where the evaluation's MT 5 is non-zero (the continuum may be lumped
there); JEFF, JENDL, TENDL and CENDL neutrons below each material's resonance range in the sweep (their MF3 lacks the
resonances; the reactor routes use PREPRO reconstructions instead). Not reached: NNDC's endf-b8.1 pages and changelog
links (404), git.nndc.bnl.gov (login), the IAEA and NEA pages (403 to the box); the IAEA medical tables come from the
lake's mirror of 2026-11-07.

**Spend.** The sweep box nsr-sweep-1 (m7i-flex.large: the account allows Free Tier types only, so not the brief's
c7i.4xlarge) about $0.16 for its hours; the job box about $0.05 for 55 PREPRO jobs; S3 and Athena under a cent. The box
is terminated.

**The retrodiction on other release pairs** (`/sweep/retrodiction?from=B-VII.1&to=B-VIII.0`, `?from=B-VII.0&to=B-VII.1`,
`?from=B-VIII.0&to=B-VIII.1&method=mf3`; `summary.pairs` in `/sweep/retrodiction`). No POINT library exists before
VIII.0, so these pairs compare both releases from MF3 above a common floor (each neutron material's larger MF2 range of
the two) on the same points; the VIII.0 to VIII.1 row by that method is the like-for-like check. Changed at RMS 0.5%;
direction is the share of changed pairs where the later release moved toward the data.

| Pair | Method | Supported | Changed (base) | Top 20 hit, enrichment, direction | Top 50 hit, enrichment, direction | Top 200 direction | All changed, direction | Top 50 enrichment at 2 / 5 / 10% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VIII.0 to VIII.1 | POINT, averaged in the resolved range | 622 | 204 (32.8%) | 25%, 0.76, 5 of 5 | 30%, 0.91, 13 of 14 | 70% | 60% | 1.05 / 1.17 / 1.18 |
| VIII.0 to VIII.1 | MF3 above the common floor | 447 | 100 (22.4%) | 15%, 0.67, 3 of 3 | 22%, 0.98, 80% | 61% | 56% | 1.08 / 1.45 / 1.63 |
| VII.1 to VIII.0 | MF3 above the common floor | 432 | 67 (15.5%) | 15%, 0.97, 1 of 3 | 14%, 0.90, 3 of 7 | 55% | 57% | 1.03 / 1.14 / 1.44 |
| VII.0 to VII.1 | MF3 above the common floor | 415 | 83 (20.0%) | 20%, 1.00, 2 of 4 | 18%, 0.90, 5 of 9 | 60% | 56% | 1.04 / 1.09 / 1.29 |

Read plainly: no pair shows the ranking predicting which sections change (enrichment near 1 at 0.5%, rising to 1.3 to
1.6 at 10% on 5 to 10 hits); the "moved toward the data" excess is clear for VIII.0 to VIII.1 by the POINT method,
weaker by MF3 alone, and absent for the two older pairs. A second box (nsr-sweep-2, minutes) ran these and is
terminated. The older pairs could only be tested by the weaker MF3-above-floor method, because the lake holds
POINT for VIII.0 and VIII.1 only, and that method does not show the result at significance on VIII.0 to VIII.1 itself
(80%, not significant); the test of the finding is to reconstruct VII.1 with PREPRO at 293.6 K (about 600 materials,
hours on one box) or to fetch NNDC's POINT2012, and rerun the VII.1 to VIII.0 pair by the POINT method.

**Done (04:40 ET):** B-VII.1 reconstructed with PREPRO at 293.6 K as release `B-VII.1-point-293.6K` (423 neutron
materials, none failed, 16,769 MF3 sections, 12.78 M points, 262 s on two m7i-flex.large boxes in parallel; `nsr.endfb_xs_points` and
`endfb_materials` partitions registered; `lake/endfb/B-VII.1-point-293.6K/manifest.json`), and VII.1 to VIII.0 rerun by
the POINT method (`/sweep/retrodiction?from=B-VII.1&to=B-VIII.0&method=point`): 595 supported pairs, 130 changed (base
21.8%); top 20: none changed; top 50: 9 changed (enrichment 0.82), 2 of 9 moved toward the data; top 200: 46%;
all changed pairs 48%. The direction result does not replicate by the same method: it is a property of the VIII.0 to
VIII.1 revision (13 of 14), not of the ranking. Spend about $0.06; both boxes terminated.

## Draft to BNL (worker-3, for lead-agent's review; Brendan sends it or not)

Subject: EXFOR against ENDF/B: disagreement predicts revision

Dear Dr. Brown,

I compared every EXFOR cross section given in barns with ENDF/B-VIII.0 and VIII.1, and with JEFF-3.3, JENDL-5,
TENDL-2023 and CENDL-3.2: 25,232 datasets, 4.4 million points. The method and code are public and the run takes under
a minute. It matches a separate comparison for U-235 (n,f) at 9 to 18 keV to within 0.001.

One result may interest CSEWG. Ranking sections by how far the evaluation sits from the measurements, in units of the
measurements' uncertainty, predicts which sections the next release revises at the measured energies. On VII.1 to VIII.0
(1,018 sections, 36 revised) the ranking gives AUC 0.67 (one-sided Mann-Whitney p = 2 × 10⁻⁴); on VIII.0 to VIII.1
(1,075 sections, 52 revised), 0.70 (p = 4 × 10⁻⁷). Defining a revision instead as a change of more than 5% at the
measured energies, the plain size of the disagreement gives 0.70 and 0.66 (p below 10⁻⁵ in both).

For VIII.1 the comparison gives a ranked list of 621 sections. 113 of its top 200 are not named in NNDC's published
VIII.1 notes; each comes with the datasets, energies and ratios behind it. It also flags 127 EXFOR datasets whose units
or energies look wrong. I have frozen today's VIII.1 ranking so that VIII.2 can test it.

Everything is at https://nsrgpt.brendan-stanton.workers.dev/sweep.

Would a list like this be useful to the CSEWG evaluators, and if so, in what form?

Brendan Stanton

## worker-1 (brief 56: site admin, File 2 and File 32, the layers)

API: https://daw1qggkn69lv.cloudfront.net (cached an hour) · origin https://3o2ps7jan4.execute-api.us-east-2.amazonaws.com.
Every route below was run on a parse box before its deploy and timed live after it.

| Item | Production | Box | Commit |
| --- | --- | --- | --- |
| Site admin: brendan@nysgpt.com, the only user in pool nsrgpt; sign-in asks for a new password after the temporary one | /signin | the box's dev reader is admin too (dev@nsrgpt.local in its list) | 6670cef |
| Housekeeping on NSRgpt's own table and bucket (nsrgpt-housekeeping): /api/housekeeping 200 for the admin | Dev tools → Housekeeping | same, but the box's role can't reach the Old account's table | 26e60a7 |
| Self sign-up on (your 03:20 decision, relayed by the lead): sign up, confirm, sign in tested with a throwaway address, then deleted | /signup | — | pool setting |
| Resonance parameters (File 2), every release | /endf/resonances?name=U-235&release=B-VIII.1 | — | b569999 |
| Resonance covariances (File 32) and correlation matrix | /endf/resonances/cov?name=Pu-240&release=B-VIII.1&matrix=1 | — | b569999 |
| The uncertainty band in the resolved range, from File 32 (the Lab and the sweep got `groups: []` there) | /endf/cov?name=Pu-240&mt=102&release=B-VIII.1 → `resolved` | — | b569999 |
| Fission product yields; decay data | /endf/fy?name=U-235&release=B-VIII.1&mt=454 · /endf/decay?name=Co-60&release=B-VIII.1 | — | b569999 |
| Decay sublibraries against ENSDF, widths excluded | /endf/decay-vs-ensdf?release=B-VIII.1&sort=sigmas | — | b569999; brief 48's last section |
| ICRP 107: nuclide, radiations, chain, half-lives against ENSDF | /icrp/nuclide/Ac-225 · /icrp/radiations/Ac-225 · /icrp/chain/U-238 · /icrp/vs-ensdf | — | b569999 |
| Live counts for /about and the lake page | /counts | — | b569999 |
| The nuclide card's links: fy_releases, decay_releases, icrp | /nuclide/225Ac | — | b569999 |
| Cross sections at 600, 900, 1200, 1500 and 1800 K (NNDC POINT, B-VIII.1 and B-VIII.0; U-238's 6.67 eV capture peak 22,765 b at 0 K, 5,385 at 600 K, 3,329 at 1800 K) | /endf/xs?name=U-238&mt=102&temp=600K&emin=6&emax=7.5 | — | 9a551f2 |
| Search: ICRP 107's 1,252 nuclides; decay and yield records open their routes | /search?q=JEFF-3.3 decay · /search?q=Ac-225 ICRP | — | 13f6aa1 |
| Data dictionary: every table added since brief 43, an ICRP 107 group, the held note fixed | /data-dictionary | /data-dictionary | 13f6aa1 |
| The lake page's ENDF counts (13 releases) | /pipeline | /pipeline | e96cf62 |
| Search: a query that is one nuclide name (Ac-225, 225Ac, 60Co, U-235, Tc-99m) puts ENSDF's record first and ICRP 107's second (marked `pinned`); other queries rank as before (brief 18's seven checked) | /search?q=Ac-225 | — | b3917ce |

What it needs from you:
- Your first sign-in: the temporary password is in SSM `/nsrgpt/admin/first-password` (us-east-2, New account). Sign in
  at /signin with it and the form asks for your own. It expires 7 days after it was set (2026-11-10).

File 2 and File 32, per release (the counts check: sections parsed against `endfb_sections`, MF2 and MF32 MT151):

| Release | MF2 sections | MF32 sections | Ranges | Resonance rows | Covariance rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| B-VIII.1 | 568 of 568 | 130 of 130 | 891 | 125,104 | 12,209,187 |
| B-VIII.0 | 566 of 566 | 118 of 118 | 884 | 116,050 | 11,540,579 |
| B-VII.1 | 423 of 423 | 54 of 54 | 667 | 84,863 | 6,233,610 |
| B-VII.0 | 393 of 393 | 9 of 10 | 628 | 78,866 | 346,554 |
| B-VI.8 | 586 of 586 | 10 of 10 | 877 | 87,691 | 5,794 |
| B-V | 130 of 130 | 6 of 6 | 230 | 11,963 | 3,066 |
| B-IV | 90 of 90 | none | 152 | 6,775 | 0 |
| B-III | 116 of 133 | none | 161 | 2,551 | 0 |
| B-II | 61 of 61 | none | 113 | 3,156 | 0 |
| JEFF-3.3 | 562 of 562 | 352 of 352 | 1,001 | 140,818 | 3,416,215 |
| JENDL-5 | 795 of 795 | 43 of 43 | 1,039 | 102,558 | 4,617,457 |
| TENDL-2023 | 2,850 of 2,850 | 9 of 9 | 5,572 | 709,426 | 2,135,886 |
| CENDL-3.2 | 272 of 272 | none | 458 | 59,184 | 0 |
| All | 7,412 of 7,430 | 731 of 732 | 12,673 | 1,529,005 | 40,508,348 |

U-235 (MAT 9228, B-VIII.1): Reich-Moore from 10⁻⁵ eV to 2.25 keV, 3,194 resonances, then unresolved to 25 keV. Fe-56
(MAT 2631): Reich-Moore to 850 keV, 312 resonances. Neither file carries File 32 in B-VIII.1, so their band stays empty.
Pu-240, Ni-58, Dy-161 and 127 more B-VIII.1 materials have one. Every LRF (1, 2, 3, 4, 7) and LCOMP (0, 1, 2) form is in
the tables; the compact correlations are decoded as ENDF-367 gives them, and every one falls within [−1, 1].

The layers (brief 55 item 6):

| Layer | Done | Left, and why |
| --- | --- | --- |
| Parsed | File 2 and 32 for 13 releases; MF4, 5, 6 and 9 to 15 counted per release into each manifest (`sections_by_mf`; every release that has them has rows, e.g. B-VIII.1: MF4 15,906 sections, MF6 13,696, MF12 15,416, MF14 15,474); POINT at 600–1800 K for B-VIII.1 and B-VIII.0 | MF4–6 and 9–15 stay sections and lines (`endfb_sections`, `endfb_records`), not tables of their own; 18 File 2/32 sections endf-parserpy refuses (B-III 17 of an older shape, B-VII.0 Th-232's File 32), listed with their MATs |
| Serving | /endf/resonances, /endf/resonances/cov, /endf/cov's band, /endf/fy, /endf/decay, /endf/decay-vs-ensdf, /icrp/*, /counts, the card's links, /endf/xs at five more temperatures | The band leaves out LRF 4 and 7 ranges (noted in the answer); it is the diagonal only, first order |
| Catalog | Dictionary entries for every table since brief 43; INVENTORY rows for the resonance tables, ICRP 107's comparison table, the decay comparison and ENDF-367 | — |
| API | README rows for every route the Lambda answers | /sweep's rows are worker-3's |
| Search | ICRP 107's nuclides; decay and yield records open /endf/decay and /endf/fy | The bare "Ac-225" ranking above; the search manifest keeps its 2026-11-08 counts (the index's state file was lost on a fresh box; the index itself uploaded) |
| UI | The lake page's counts (lib/pipeline-map.ts) | Listed below for the UI window |

For the UI window (not done here):
- `lib/lab/kinds/data.ts` (the cov source) reads `series[].groups` only. Below the unresolved range those are empty and
  `series[].resolved.groups` (`rel_sd`, `rel_sd_uncorrelated`) holds the File 32 band. Draw it there.
- The Lab's ENDF block could offer `temp` (0K, 293.6K, 600K, 900K, 1200K, 1500K, 1800K) now that /endf/xs serves them.
- `lib/lab/canvases/plot.ts` RELEASE_SLOT gives colours to seven releases; B-VII.0, B-VI.8, B-V, B-IV, B-III and B-II
  have none.
- The nuclide card can link /endf/fy, /endf/decay and /icrp/nuclide from `/nuclide/{name}`'s `fy_releases`,
  `decay_releases` and `icrp`.

Spend: the parse box nsr-parse-3 (m7i-flex.large, 400 GB gp3, about $0.14 an hour) for about 1.5 hours, about $0.21;
Athena about $0.01. The box is terminated (09:35 UTC).

## QA drive (worker-4, brief 60 Part D, 06:15–06:26 ET)

Every page below loaded headless (Playwright, `scripts/gnds/qa/drive.js` on the dev box) on production
(https://nsrgpt.brendan-stanton.workers.dev) and the box (http://3.133.98.108:3000), in light then dark, 1440 × 900, signed
out. Rendered: status under 400, no page error, no error text on the page, its text present. Errors: page errors,
console errors and failed requests, leaving out the box's `/api/housekeeping` 403 and `/api/warm` 429 and the browser's
aborted navigation requests (`ERR_ABORTED` on the page's own URL or a cancelled `/api/search`). Data painted: the later of
the largest contentful paint and the last data response, in seconds; light runs first, so its time includes the cold load.
Screenshots: `lake/_work/qa/2026-11-11/{prod,box}-<shot>-{light,dark}.png` (104), with `results.json`.

| Page | Production | Box | First error | Data painted, prod light / dark | Box light / dark | Shot |
| --- | --- | --- | --- | --- | --- | --- |
| / | yes | yes | — | 2 / 1.3 | 7.3 / 3.4 | `home` |
| /about | yes | yes | — | 6.4 / 0.5 | 3.6 / 1.4 | `about` |
| /chat | yes | yes | — | 3 / 3 | 7.9 / 2.5 | `chat` |
| /data-dictionary | yes | yes | — | 0.6 / 0.6 | 5.3 / 3.1 | `data-dictionary` |
| /datasets/endf | yes | yes | — | 0.6 / 0.5 | 3.3 / 2.1 | `datasets_endf` |
| /datasets/endf/B-VIII.1/9228 | yes | yes | — | 2.2 / 0.7 | 5 / 2.8 | `datasets_endf_B-VIII.1_9228` |
| /datasets/exfor/10001 | yes | yes | — | 4.3 / 0.6 | 4 / 2 | `datasets_exfor_10001` |
| /graph | yes | yes | — | 1.3 / 0.8 | 7.2 / 3.8 | `graph` |
| /lab | yes | yes | prod: 401 https://nsrgpt.brendan-stanton.workers.dev/api/jobs | 7.9 / 1.1 | 7.9 / 3.8 | `lab` |
| /nsrcpt | yes | yes | — | 0.6 / 0.5 | 2.1 / 1.5 | `nsrcpt` |
| /pipeline | yes | yes | — | 1.1 / 0.6 | 3.7 / 2.9 | `pipeline` |
| /signin | yes | yes | — | 0.3 / 0.2 | 2.5 / 2.4 | `signin` |
| /signup | yes | yes | — | 0.2 / 0.2 | 4 / 2.8 | `signup` |
| /sweep | yes | yes | — | 0.9 / 0.6 | 2.4 / 2.1 | `sweep` |
| /sweep/icrp | yes | yes | — | 1.4 / 1.1 | 2.3 / 2.7 | `sweep_icrp` |
| /sweep/medical | yes | yes | — | 0.8 / 0.5 | 3.7 / 1.5 | `sweep_medical` |
| /sweep/medical/ac225-ra226-gn | yes | yes | — | 1.3 / 0.7 | 3.3 / 2.5 | `sweep_medical_ac225-ra226-gn` |
| /sweep?tab=retrodiction | yes | yes | — | 0.7 / 0.7 | 2.6 / 2.5 | `sweep_tab_retrodiction` |
| /viz/chart | yes | yes | — | 0.6 / 0.5 | 2.5 / 2.7 | `viz_chart` |
| /viz/chart?nuclide=235U | yes | yes | — | 2 / 1.4 | 3.6 / 2.3 | `viz_chart_nuclide_235U` |
| /viz/decay | yes | yes | box light: 19 React "synchronously unmount a root" warnings | 1.1 / 0.7 | 7.6 / 1.4 | `viz_decay` |
| /viz/graph | yes | yes | — | 0.8 / 0.5 | 6.5 / 1.8 | `viz_graph` |
| /viz/matrix | yes | yes | — | 0.6 / 0.5 | 4.9 / 1.5 | `viz_matrix` |
| /viz/scatter3d-dataset | yes | yes | — | 0.7 / 0.5 | 5.5 / 1.7 | `viz_scatter3d-dataset` |
| /viz/spectra | yes | yes | — | 0.6 / 0.4 | 6.1 / 1.7 | `viz_spectra` |
| /viz/structure | yes | yes | — | 0.4 / 0.4 | 5.3 / 1.6 | `viz_structure` |

Failures and differences:
1. **/lab on production, signed out:** `POST /api/jobs` answers 401 three times ("Sign in to run a job."), so the default
   canvas shows "Sign in to run a job." on Broaden to 300 K and "An input failed: Broaden to 300 K" on Measured against
   evaluated and σ against energy. On the box the same canvas runs (Broaden 4.3 s, the three 300 K curves drawn). The
   sign-in rule is `app/api/jobs/route.ts` (brief 52); owner worker-2 (the Lab).
2. **/viz/decay on the box:** 19 React "Attempted to synchronously unmount a root while React was already rendering"
   console errors on the first (light) load; production and the box's dark load log none. Known since brief 54 (worker-2's
   section above: main logs the same 19); owner worker-2.
3. Every other page rendered on both, in both themes, with no error left after the noise above.
