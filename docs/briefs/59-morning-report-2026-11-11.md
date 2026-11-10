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

The cyclotron yields use Bethe stopping powers with ICRU 37 I values; on the IAEA curves they reproduce the IAEA's own
published thick-target yields to 0.965–1.002 on 7 of 8 routes (Ra-226(p,2n): 1.358, cause not found).

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
terminated.

## Draft to BNL (worker-3, for lead-agent's review; Brendan sends it or not)

Subject: EXFOR against ENDF/B-VIII.0 and VIII.1: a ranked comparison

Dear Dr. Brown,

I compared every EXFOR cross section given in barns with ENDF/B-VIII.0 and VIII.1, and with JEFF-3.3, JENDL-5,
TENDL-2023 and CENDL-3.2: 25,232 datasets, 4.4 million points, 4,266 target and reaction pairs. The method and code are
public and the whole run takes under a minute. As a check, it matches a separate comparison for U-235 (n,f) at 9 to
18 keV to within 0.001.

Ranking the pairs by their disagreement with VIII.0 did not predict which ones VIII.1 changed. Where VIII.1 did change a
high-ranked pair, though, it moved toward the measurements: 13 of the 14 changed pairs in the top 50, against 60% of all
changed pairs. The same test on VII.1 to VIII.0 shows no such effect (3 of 7, against 57%), so with this few pairs I
treat the VIII.1 result as suggestive, not settled.

For VIII.1 the comparison gives a ranked list of 621 pairs. 113 of its top 200 are not named in NNDC's published VIII.1
notes; each comes with the datasets, energies and ratios behind it. It also flags 127 EXFOR datasets whose units or
energies look wrong.

Everything is at https://nsrgpt.brendan-stanton.workers.dev/sweep.

Would a list like this be useful to the CSEWG evaluators, and if so, in what form?

Brendan Stanton
