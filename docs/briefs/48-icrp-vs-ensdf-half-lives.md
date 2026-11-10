# 48 — ICRP 107's half-lives against ENSDF, every nuclide (2026-11-10, lead-agent, overnight before launch)

ICRP Publication 107 (2008) is the decay-data standard every internal-dose calculation uses (its NDX file: 1,252
nuclides, half-lives printed without uncertainties). ENSDF is the evaluated structure database the lake holds as the
2026-11-05 distribution (`ensdf_261105.zip`, `nsr.nuclide_serve_levels` and `nuclide_serve_summary`). This table
puts every ICRP 107 ground state (992) and first isomer `m` (254) beside ENSDF's adopted half-life for the same
state and says where they differ by more than three times ENSDF's stated uncertainty.

Table `nsr.icrp107_vs_ensdf` (Parquet, `lake/icrp107/2008/vs_ensdf/`, 1,246 rows), built by one Athena query
(`scripts/sweep/icrp-vs-ensdf.sql`), rerun the day either source changes. Columns: nuclide, isomer, ICRP's printed
half-life and unit, both in seconds, ENSDF's level (energy, Jπ, its half-life text), ENSDF's relative uncertainty,
`rel_diff` (ICRP − ENSDF)/ENSDF, `sigmas` |diff| / ENSDF's uncertainty, and `note`.

Method. Ground state: ENSDF's level 1. Isomer `m`: the ENSDF level above the ground state whose half-life is nearest
ICRP's on a log scale (ICRP's `m` is defined by its own half-life, and a nuclide can have several isomers). ENSDF's
uncertainty is read from its text the ENSDF way (the trailing digits apply to the last printed decimals; an
asymmetric `+a-b` takes the larger; `GT`, `LT`, `AP` values are set aside as limits). ICRP's values are printed to
three to five significant figures: a difference under half a unit of ICRP's last printed digit is rounding, not
disagreement, and the table prints ICRP's value as held so a reader sees which (Ac-225 at 10.0 d against 9.920 d is
not rounding; Lu-177 at 6.647 d against 6.6443 d is).

| Note | Ground states | Isomers `m` |
| --- | --- | --- |
| agree within 3 sigma of ENSDF | 918 | 236 |
| differ by more than 3 sigma of ENSDF | 65 | 10 |
| the ICRP ground state is another ENSDF level: state ordering differs | 5 | — |
| no ENSDF isomer within 20% of the ICRP half-life (the same five nuclides: ICRP and ENSDF swap which state is the ground state) | — | 5 |
| ENSDF gives a limit or approximate value | 2 | 1 |
| ENSDF uncertainty not parsed (text without digits) | 2 | 2 |

Among the 75 that differ by more than three sigma: Th-229 (7,340 y against 7,907 y, the Ac-225 generator parent),
Ac-225 (10.0 d against 9.920 d), Ra-224 (3.66 d against 3.6316 d, the Pb-212 generator), U-230 (20.8 d against
20.23 d), Sm-153 (46.5 h against 46.284 h), Sc-44 (3.97 h against 4.0420 h), Rb-82 (1.273 min against 1.2575 min),
Hg-197, As-76, I-123, Tc-99m (6.015 h against 6.0072 h), Fe-60 (1.5 My against 2.62 My), Sm-146, Ni-59, Tc-97,
Pt-190, Po-213 (4.2 µs against 3.706 µs), Bi-207 (32.9 y against 31.55 y). Every row below.

## Every row that is not "agree within 3 sigma"

| Nuclide | ICRP 107 | ENSDF (level keV, Jπ) | Difference | Sigma | ENSDF level matching ICRP | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Te-123 | 6.0E14 y | 9.2E+16 Y GT (0.0, 1/2+) | -99.35% | — |  | ENSDF gives a limit or approximate value |
| Cm-250 | 8300.0 y | 8.3E+3 Y AP (0.0, 0+) | 0.0% | — |  | ENSDF gives a limit or approximate value |
| U-235m | 26.0 m | 26 M AP (0.076, 1/2+) | 0.0% | — |  | ENSDF gives a limit or approximate value |
| Yb-175 | 4.185 d | 4.1615 d 30 (0.0, 7/2-) | 0.56% | — |  | ENSDF uncertainty not parsed |
| Re-186m | 200000.0 y | 2.0E+5 Y (148.2, (8+)) | 0.0% | — |  | ENSDF uncertainty not parsed |
| Am-244m | 26.0 m | 26 M (89.5, 1+) | 0.0% | — |  | ENSDF uncertainty not parsed |
| Tm-175 | 15.2 m | 15.2 min 5 (0.0, (1/2+)) | 0.0% | — |  | ENSDF uncertainty not parsed |
| Tb-146 | 23.0 s | 8 S 4 (0.0, 1+) | 187.5% | 3.8 |  | differ by more than 3 sigma of ENSDF |
| Sm-146 | 1.03E8 y | 6.8E+7 Y 7 (0.0, 0+) | 51.47% | 5.0 |  | differ by more than 3 sigma of ENSDF |
| V-50 | 1.5E17 y | 2.65E+17 Y +16-18 (0.0, 6+) | -43.4% | 6.4 |  | differ by more than 3 sigma of ENSDF |
| Fe-60 | 1500000.0 y | 2.62E+6 Y 4 (0.0, 0+) | -42.75% | 28.0 |  | differ by more than 3 sigma of ENSDF |
| Tc-97 | 2600000.0 y | 4.21E+6 Y 16 (0.0, 9/2+) | -38.24% | 10.1 |  | differ by more than 3 sigma of ENSDF |
| Ni-59 | 101000.0 y | 7.6E+4 Y 5 (0.0, 3/2-) | 32.89% | 5.0 |  | differ by more than 3 sigma of ENSDF |
| Pt-190 | 6.5E11 y | 4.97E11 Y 16 (0.0, 0+) | 30.78% | 9.6 |  | differ by more than 3 sigma of ENSDF |
| Ag-116 | 2.68 m | 230 S 5 (0.0, (0-)) | -30.09% | 13.8 |  | differ by more than 3 sigma of ENSDF |
| Po-209 | 102.0 y | 124 Y 3 (0.0, 1/2-) | -17.74% | 7.3 |  | differ by more than 3 sigma of ENSDF |
| At-218 | 1.5 s | 1.28 S 6 (0.0, (3-,2-)) | 17.19% | 3.7 |  | differ by more than 3 sigma of ENSDF |
| Si-32 | 132.0 y | 157 Y 7 (0.0, 0+) | -15.92% | 3.6 |  | differ by more than 3 sigma of ENSDF |
| Po-213 | 4.2E-6 s | 3.706 US 1 (0.0, 9/2+) | 13.33% | 494.0 |  | differ by more than 3 sigma of ENSDF |
| Ra-222 | 38.0 s | 33.6 S 4 (0.0, 0+) | 13.1% | 11.0 |  | differ by more than 3 sigma of ENSDF |
| Re-182m | 12.7 h | 14.14 H 45 (?, 2+) | -10.18% | 3.2 |  | differ by more than 3 sigma of ENSDF |
| Te-131m | 30.0 h | 33.25 H 25 (182.258, 11/2-) | -9.77% | 13.0 |  | differ by more than 3 sigma of ENSDF |
| Re-184 | 38.0 d | 35.4 D 7 (0.0, 3(-)) | 7.34% | 3.7 |  | differ by more than 3 sigma of ENSDF |
| Th-229 | 7340.0 y | 7907 Y 24 (0.0, 5/2+) | -7.17% | 23.6 |  | differ by more than 3 sigma of ENSDF |
| Sb-133 | 2.5 m | 2.34 M 5 (0.0, (7/2+)) | 6.84% | 3.2 |  | differ by more than 3 sigma of ENSDF |
| Kr-75 | 4.29 m | 4.60 M 7 (0.0, 5/2+) | -6.74% | 4.4 |  | differ by more than 3 sigma of ENSDF |
| Te-121m | 154.0 d | 164.2 D 8 (293.974, 11/2-) | -6.21% | 12.7 |  | differ by more than 3 sigma of ENSDF |
| Hf-183 | 1.067 h | 1.018 H 2 (0.0, (3/2-)) | 4.81% | 24.5 |  | differ by more than 3 sigma of ENSDF |
| Pr-138m | 2.12 h | 2.03 H 2 (364.0, 7-) | 4.43% | 4.5 |  | differ by more than 3 sigma of ENSDF |
| Kr-77 | 74.4 m | 71.25 M 42 (0.0, 5/2+) | 4.42% | 7.5 |  | differ by more than 3 sigma of ENSDF |
| Zn-71m | 3.96 h | 4.140 H 15 (155.62, 9/2+) | -4.35% | 12.0 |  | differ by more than 3 sigma of ENSDF |
| V-53 | 1.61 m | 1.543 M 14 (0.0, 7/2-) | 4.34% | 4.8 |  | differ by more than 3 sigma of ENSDF |
| Bi-207 | 32.9 y | 31.55 Y 4 (0.0, 9/2-) | 4.28% | 33.8 |  | differ by more than 3 sigma of ENSDF |
| Cd-113 | 7.7E15 y | 8.04E15 Y 5 (0.0, 1/2+) | -4.23% | 6.8 |  | differ by more than 3 sigma of ENSDF |
| Ho-167 | 3.1 h | 2.98 H 3 (0.0, 7/2-) | 4.03% | 4.0 |  | differ by more than 3 sigma of ENSDF |
| Ho-164m | 38.0 m | 36.6 M 3 (139.78, 6-) | 3.83% | 4.7 |  | differ by more than 3 sigma of ENSDF |
| Rn-218 | 0.035 s | 33.75 MS 15 (0.0, 0+) | 3.7% | 8.3 |  | differ by more than 3 sigma of ENSDF |
| Cs-125 | 45.0 m | 46.7 M 1 (0.0, 1/2(+)) | -3.64% | 17.0 |  | differ by more than 3 sigma of ENSDF |
| U-230 | 20.8 d | 20.23 D 2 (0.0, 0+) | 2.82% | 28.5 |  | differ by more than 3 sigma of ENSDF |
| Cs-138 | 33.41 m | 32.5 M 2 (0.0, 3-) | 2.8% | 4.5 |  | differ by more than 3 sigma of ENSDF |
| Os-191 | 15.4 d | 14.99 D 2 (0.0, 9/2-) | 2.74% | 20.5 |  | differ by more than 3 sigma of ENSDF |
| Te-127m | 109.0 d | 106.1 D 7 (88.23, 11/2-) | 2.73% | 4.1 |  | differ by more than 3 sigma of ENSDF |
| Bi-205 | 15.31 d | 14.91 D 7 (0.0, 9/2-) | 2.68% | 5.7 |  | differ by more than 3 sigma of ENSDF |
| Th-233 | 22.3 m | 21.83 M 4 (0.0, 1/2+) | 2.15% | 11.8 |  | differ by more than 3 sigma of ENSDF |
| Tl-202 | 12.23 d | 12.4706 D 55 (0.0, 2-) | -1.93% | 43.7 |  | differ by more than 3 sigma of ENSDF |
| Sc-44 | 3.97 h | 4.0420 H 25 (0.0, 2+) | -1.78% | 28.8 |  | differ by more than 3 sigma of ENSDF |
| Sn-117m | 13.76 d | 14.00 D 5 (314.58, 11/2-) | -1.71% | 4.8 |  | differ by more than 3 sigma of ENSDF |
| Pu-244 | 8.0E7 y | 8.13E+7 Y 3 (0.0, 0+) | -1.6% | 4.3 |  | differ by more than 3 sigma of ENSDF |
| Po-212 | 2.99E-7 s | 294.3 NS 8 (0.0, 0+) | 1.6% | 5.9 |  | differ by more than 3 sigma of ENSDF |
| O-19 | 26.464 s | 26.88 S 5 (0.0, 5/2+) | -1.55% | 8.3 |  | differ by more than 3 sigma of ENSDF |
| Ti-44 | 60.0 y | 59.1 Y 3 (0.0, 0+) | 1.52% | 3.0 |  | differ by more than 3 sigma of ENSDF |
| As-76 | 1.0778 d | 26.254 H 11 (0.0, 2-) | -1.47% | 35.2 |  | differ by more than 3 sigma of ENSDF |
| Hg-197 | 64.94 h | 64.14 H 5 (0.0, 1/2-) | 1.25% | 16.0 |  | differ by more than 3 sigma of ENSDF |
| Rb-82 | 1.273 m | 1.2575 M 2 (0.0, 1+) | 1.23% | 77.5 |  | differ by more than 3 sigma of ENSDF |
| Br-83 | 2.4 h | 2.374 H 4 (0.0, 3/2-) | 1.1% | 6.5 |  | differ by more than 3 sigma of ENSDF |
| Sn-110 | 4.11 h | 4.154 H 4 (0.0, 0+) | -1.06% | 11.0 |  | differ by more than 3 sigma of ENSDF |
| Ta-186 | 10.5 m | 10.39 M 3 (0.0, (3-)) | 1.06% | 3.7 |  | differ by more than 3 sigma of ENSDF |
| In-109 | 4.2 h | 4.159 H 10 (0.0, 9/2+) | 0.99% | 4.1 |  | differ by more than 3 sigma of ENSDF |
| Pu-237 | 45.2 d | 45.64 D 4 (0.0, 7/2-) | -0.96% | 11.0 |  | differ by more than 3 sigma of ENSDF |
| Bi-214 | 19.9 m | 19.71 M 2 (0.0, 1-) | 0.96% | 9.5 |  | differ by more than 3 sigma of ENSDF |
| Pb-214 | 26.8 m | 27.06 M 7 (0.0, 0+) | -0.96% | 3.7 |  | differ by more than 3 sigma of ENSDF |
| Os-193 | 30.11 h | 29.830 H 18 (0.0, 3/2-) | 0.94% | 15.6 |  | differ by more than 3 sigma of ENSDF |
| Hf-175 | 70.0 d | 70.65 D 19 (0.0, 5/2(-)) | -0.92% | 3.4 |  | differ by more than 3 sigma of ENSDF |
| Np-238 | 2.117 d | 2.099 D 2 (0.0, 2+) | 0.86% | 9.0 |  | differ by more than 3 sigma of ENSDF |
| Bk-249 | 330.0 d | 327.2 D 3 (0.0, 7/2+) | 0.86% | 9.3 |  | differ by more than 3 sigma of ENSDF |
| Ac-225 | 10.0 d | 9.920 D 3 (0.0, (3/2-)) | 0.81% | 26.7 |  | differ by more than 3 sigma of ENSDF |
| Ge-77 | 11.3 h | 11.211 H 3 (0.0, 7/2+) | 0.79% | 29.7 |  | differ by more than 3 sigma of ENSDF |
| Ra-224 | 3.66 d | 3.6316 D 23 (0.0, 0+) | 0.78% | 12.3 |  | differ by more than 3 sigma of ENSDF |
| Ir-194 | 19.28 h | 19.18 H 3 (0.0, 1-) | 0.52% | 3.3 |  | differ by more than 3 sigma of ENSDF |
| Po-214 | 1.643E-4 s | 163.46 US 4 (0.0, 0+) | 0.51% | 21.0 |  | differ by more than 3 sigma of ENSDF |
| Sm-153 | 46.5 h | 46.284 H 4 (0.0, 3/2+) | 0.47% | 54.0 |  | differ by more than 3 sigma of ENSDF |
| Sr-90 | 28.79 y | 28.91 Y 3 (0.0, 0+) | -0.42% | 4.0 |  | differ by more than 3 sigma of ENSDF |
| I-123 | 13.27 h | 13.2230 H 19 (0.0, 5/2+) | 0.36% | 24.7 |  | differ by more than 3 sigma of ENSDF |
| Cs-134m | 2.903 h | 2.912 H 2 (138.7441, 8-) | -0.31% | 4.5 |  | differ by more than 3 sigma of ENSDF |
| Th-230 | 75380.0 y | 75584 Y 55 (0.0, 0+) | -0.27% | 3.7 |  | differ by more than 3 sigma of ENSDF |
| Au-196 | 6.183 d | 6.1669 D 6 (0.0, 2-) | 0.26% | 26.8 |  | differ by more than 3 sigma of ENSDF |
| Xe-127 | 36.4 d | 36.346 D 3 (0.0, 1/2+) | 0.15% | 18.0 |  | differ by more than 3 sigma of ENSDF |
| Tc-99m | 6.015 h | 6.0072 H 9 (142.6836, 1/2-) | 0.13% | 8.7 |  | differ by more than 3 sigma of ENSDF |
| Xe-133 | 5.243 d | 5.2475 D 5 (0.0, 3/2+) | -0.09% | 9.0 |  | differ by more than 3 sigma of ENSDF |
| I-131 | 8.0207 d | 8.0252 D 6 (0.0, 7/2+) | -0.06% | 7.5 |  | differ by more than 3 sigma of ENSDF |
| Lu-177 | 6.647 d | 6.6443 D 9 (0.0, 7/2+) | 0.04% | 3.0 |  | differ by more than 3 sigma of ENSDF |
| Au-198 | 2.69517 d | 2.6941 D 2 (0.0, 2-) | 0.04% | 5.3 |  | differ by more than 3 sigma of ENSDF |
| Pm-137m | 2.4 m | 34.0 PS 21 (337.5, 15/2-) | 4.2352941176460594E14% | 6.85714285714124E13 |  | no ENSDF isomer within 20% of the ICRP half-life |
| Y-84m | 39.5 m | 4.6 S 2 (67.0, 1+) | 51421.74% | 11827.0 |  | no ENSDF isomer within 20% of the ICRP half-life |
| Ta-178m | 2.36 h | 9.31 M 3 (?, (1+)) | 1420.95% | 4409.7 |  | no ENSDF isomer within 20% of the ICRP half-life |
| Pm-154m | 2.68 m | 1.73 M 10 (?, (1-)) | 54.91% | 9.5 |  | no ENSDF isomer within 20% of the ICRP half-life |
| Pr-134m | 17.0 m | 11 M AP (?, (6-)) | 54.55% | — |  | no ENSDF isomer within 20% of the ICRP half-life |
| Ta-178 | 9.31 m | 2.36 H 8 (0.0, 7-) | -93.43% | 27.6 | 9.31 M 3 | the ICRP ground state is another ENSDF level: state ordering differs |
| Pm-136 | 107.0 s | 300 S 50 (0.0, (2)) | -64.33% | 3.9 | 107 S 6 | the ICRP ground state is another ENSDF level: state ordering differs |
| Pm-154 | 1.73 m | 2.68 M 7 (0.0, (4+)) | -35.45% | 13.6 | 1.73 M 10 | the ICRP ground state is another ENSDF level: state ordering differs |
| Pr-134 | 11.0 m | 17 M 2 (0.0, 2-) | -35.29% | 3.0 | 11 M AP | the ICRP ground state is another ENSDF level: state ordering differs |
| Ra-219 | 10.0 ms | 9 MS 2 (0.0, (7/2+)) | 11.11% | 0.5 | 10 MS 3 | the ICRP ground state is another ENSDF level: state ordering differs |

The five swapped states (ground and `m` rows): Ta-178 (ICRP ground 9.31 min, ENSDF level 1 is the 2.36 h 7−
state), Pm-154 (1.73 min against 2.68 min), Pr-134 (11 min against 17 min), Y-84 (39.5 min against 4.6 s), Pm-137
(2.4 min against 34 ps): ENSDF lists the other state first because the ordering of the two is not established; the
half-lives themselves agree. The two limits: Te-123 (ICRP 6.0e14 y; ENSDF > 9.2e16 y) and Cm-250 (ENSDF
approximate), and U-235m and Pr-134m (ENSDF approximate).

What it is for: a dosimetrist can see at once which ICRP 107 half-lives the current evaluation has moved, by how
much, and against what stated uncertainty, with the ENSDF text as the receipt; the medical rows (Ac-225, Th-229,
Ra-224, U-230, Sm-153, Sc-44, Rb-82, Tc-99m, I-123) are the ones a therapy or PET dose calculation carries.
Served by `GET /icrp/vs-ensdf` (worker-1, brief 56 Part C) once deployed.

## The libraries' decay sublibraries against ENSDF

Every MT457 half-life in eight releases' decay sublibraries (ground states and isomers) beside ENSDF 2026-11-05's for the
same state: table `nsr.endf_decay_vs_ensdf` (`lake/endfb/_compare/decay_vs_ensdf/`), built by
`scripts/sweep/endf-decay-vs-ensdf.sql` in Athena (workgroup primary), served by `GET /endf/decay-vs-ensdf`. sigmas is the
difference over the library's and ENSDF's stated uncertainties added in quadrature. An ENSDF state quoted as a width
(MEV, KEV, EV) is noted "ENSDF gives a width" and not compared (2026-11-10, brief 56).

| Release | Total | agree within 3 sigma | differ by more than 3 sigma | ENSDF gives a limit or approximate value | ENSDF gives a width | no ENSDF half-life for this state | no ENSDF isomer within 20% of the library half-life | no uncertainty on either side |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| B-VIII.1 | 3,559 | 3,103 | 160 | 87 | 26 | 138 | 37 | 8 |
| B-VIII.0 | 3,559 | 3,103 | 160 | 87 | 26 | 138 | 37 | 8 |
| B-VII.1 | 3,558 | 3,102 | 160 | 87 | 26 | 138 | 37 | 8 |
| B-VII.0 | 3,561 | 3,082 | 180 | 77 | 21 | 145 | 49 | 7 |
| B-VI.8 | 978 | 735 | 215 | 9 | 0 | 5 | 12 | 2 |
| B-V | 30 | 27 | 2 | 0 | 0 | 1 | 0 | 0 |
| JEFF-3.3 | 3,604 | 3,045 | 194 | 94 | 25 | 164 | 76 | 6 |
| JENDL-5 | 3,819 | 3,364 | 71 | 111 | 26 | 197 | 42 | 8 |

The top 20 per release by |rel_diff| among the states that differ by more than 3 sigma (B-V has two):

### B-VIII.1

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| O-26 | 0 | 0+ | 4.000e-8 | 0 | 4.500e-12 | 4.5 PS +32-34 | 8888 | 1.176e+4 |
| Tb-135 | 0 | (7/2-) | 0.995 | 0.275 | 9.400e-4 | 0.94 MS +33-22 | 1058 | 2367 |
| Mn-60 | 0 | 1+ | 51 | 6 | 0.28 | 0.28 S 2 | 181.1 | 1316 |
| Pr-121 | 0 | (3/2) | 1.4 | 0.8 | 0.01 | 10 MS +6-3 | 139 | 167.8 |
| Hs-273 | 0 |  | 50 | 0 | 0.51 | 0.51 S +30-13 | 97.04 | 165 |
| Sg-266 | 0 | 0+ | 25 | 16 | 0.34 | 0.34 S +19-9 | 72.53 | 85.37 |
| Lr-251 | 0 | (7/2-) | 1.341 | 0 | 0.0244 | 24.4 MS +70-45 | 53.96 | 188.1 |
| Pm-140 | 0 | 1+ | 357 | 3 | 9.2 | 9.2 S 2 | 37.8 | 1622 |
| Br-68 | 0 |  | 1.200e-6 | 0 | 3.500e-8 | 35 NS 5 | 33.29 | 233 |
| Rb-72 | 0 |  | 1.200e-6 | 0 | 1.030e-7 | 103 NS 22 | 10.65 | 49.86 |
| V-43 | 0 |  | 0.8 | 0 | 0.0793 | 79.3 MS 24 | 9.088 | 300.3 |
| Tl-186 | 0 | (2-) | 27.5 | 1 | 3.4 | 3.4 S +5-4 | 7.088 | 46.79 |
| Mn-62 | 0 | 1+ | 0.671 | 0.005 | 0.092 | 92 MS 13 | 6.293 | 44.48 |
| Ra-202 | 0 | 0+ | 0.0275 | 0.0185 | 0.0038 | 3.8 MS +13-8 | 6.237 | 8.264 |
| Pd-125 | 0 |  | 0.3987 | 0 | 0.057 | 57 MS 10 | 5.995 | 34.17 |
| Ag-93 | 0 |  | 1.500e-6 | 0 | 2.280e-7 | 228 NS 16 | 5.579 | 79.5 |
| Mg-35 | 0 | (3/2-,5/2-) | 0.07 | 0.04 | 0.0113 | 11.3 MS 6 | 5.195 | 9.052 |
| Pd-126 | 0 | 0+ | 0.2499 | 0 | 0.0485 | 48.5 MS 7 | 4.153 | 287.7 |
| Cm-236 | 0 | 0+ | 1900 | 0 | 408 | 6.8 M 8 | 3.657 | 31.08 |
| Re-172 | 0 | (5+) | 55 | 5 | 15 | 15 S 3 | 2.667 | 12.14 |

### B-VIII.0

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| O-26 | 0 | 0+ | 4.000e-8 | 0 | 4.500e-12 | 4.5 PS +32-34 | 8888 | 1.176e+4 |
| Tb-135 | 0 | (7/2-) | 0.995 | 0.275 | 9.400e-4 | 0.94 MS +33-22 | 1058 | 2367 |
| Mn-60 | 0 | 1+ | 51 | 6 | 0.28 | 0.28 S 2 | 181.1 | 1316 |
| Pr-121 | 0 | (3/2) | 1.4 | 0.8 | 0.01 | 10 MS +6-3 | 139 | 167.8 |
| Hs-273 | 0 |  | 50 | 0 | 0.51 | 0.51 S +30-13 | 97.04 | 165 |
| Sg-266 | 0 | 0+ | 25 | 16 | 0.34 | 0.34 S +19-9 | 72.53 | 85.37 |
| Lr-251 | 0 | (7/2-) | 1.341 | 0 | 0.0244 | 24.4 MS +70-45 | 53.96 | 188.1 |
| Pm-140 | 0 | 1+ | 357 | 3 | 9.2 | 9.2 S 2 | 37.8 | 1622 |
| Br-68 | 0 |  | 1.200e-6 | 0 | 3.500e-8 | 35 NS 5 | 33.29 | 233 |
| Rb-72 | 0 |  | 1.200e-6 | 0 | 1.030e-7 | 103 NS 22 | 10.65 | 49.86 |
| V-43 | 0 |  | 0.8 | 0 | 0.0793 | 79.3 MS 24 | 9.088 | 300.3 |
| Tl-186 | 0 | (2-) | 27.5 | 1 | 3.4 | 3.4 S +5-4 | 7.088 | 46.79 |
| Mn-62 | 0 | 1+ | 0.671 | 0.005 | 0.092 | 92 MS 13 | 6.293 | 44.48 |
| Ra-202 | 0 | 0+ | 0.0275 | 0.0185 | 0.0038 | 3.8 MS +13-8 | 6.237 | 8.264 |
| Pd-125 | 0 |  | 0.3987 | 0 | 0.057 | 57 MS 10 | 5.995 | 34.17 |
| Ag-93 | 0 |  | 1.500e-6 | 0 | 2.280e-7 | 228 NS 16 | 5.579 | 79.5 |
| Mg-35 | 0 | (3/2-,5/2-) | 0.07 | 0.04 | 0.0113 | 11.3 MS 6 | 5.195 | 9.052 |
| Pd-126 | 0 | 0+ | 0.2499 | 0 | 0.0485 | 48.5 MS 7 | 4.153 | 287.7 |
| Cm-236 | 0 | 0+ | 1900 | 0 | 408 | 6.8 M 8 | 3.657 | 31.08 |
| Re-172 | 0 | (5+) | 55 | 5 | 15 | 15 S 3 | 2.667 | 12.14 |

### B-VII.1

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| O-26 | 0 | 0+ | 4.000e-8 | 0 | 4.500e-12 | 4.5 PS +32-34 | 8888 | 1.176e+4 |
| Tb-135 | 0 | (7/2-) | 0.995 | 0.275 | 9.400e-4 | 0.94 MS +33-22 | 1058 | 2367 |
| Mn-60 | 0 | 1+ | 51 | 6 | 0.28 | 0.28 S 2 | 181.1 | 1316 |
| Pr-121 | 0 | (3/2) | 1.4 | 0.8 | 0.01 | 10 MS +6-3 | 139 | 167.8 |
| Hs-273 | 0 |  | 50 | 0 | 0.51 | 0.51 S +30-13 | 97.04 | 165 |
| Sg-266 | 0 | 0+ | 25 | 16 | 0.34 | 0.34 S +19-9 | 72.53 | 85.37 |
| Lr-251 | 0 | (7/2-) | 1.341 | 0 | 0.0244 | 24.4 MS +70-45 | 53.96 | 188.1 |
| Pm-140 | 0 | 1+ | 357 | 3 | 9.2 | 9.2 S 2 | 37.8 | 1622 |
| Br-68 | 0 |  | 1.200e-6 | 0 | 3.500e-8 | 35 NS 5 | 33.29 | 233 |
| Rb-72 | 0 |  | 1.200e-6 | 0 | 1.030e-7 | 103 NS 22 | 10.65 | 49.86 |
| V-43 | 0 |  | 0.8 | 0 | 0.0793 | 79.3 MS 24 | 9.088 | 300.3 |
| Tl-186 | 0 | (2-) | 27.5 | 1 | 3.4 | 3.4 S +5-4 | 7.088 | 46.79 |
| Mn-62 | 0 | 1+ | 0.671 | 0.005 | 0.092 | 92 MS 13 | 6.293 | 44.48 |
| Ra-202 | 0 | 0+ | 0.0275 | 0.0185 | 0.0038 | 3.8 MS +13-8 | 6.237 | 8.264 |
| Pd-125 | 0 |  | 0.3987 | 0 | 0.057 | 57 MS 10 | 5.995 | 34.17 |
| Ag-93 | 0 |  | 1.500e-6 | 0 | 2.280e-7 | 228 NS 16 | 5.579 | 79.5 |
| Mg-35 | 0 | (3/2-,5/2-) | 0.07 | 0.04 | 0.0113 | 11.3 MS 6 | 5.195 | 9.052 |
| Pd-126 | 0 | 0+ | 0.2499 | 0 | 0.0485 | 48.5 MS 7 | 4.153 | 287.7 |
| Cm-236 | 0 | 0+ | 1900 | 0 | 408 | 6.8 M 8 | 3.657 | 31.08 |
| Re-172 | 0 | (5+) | 55 | 5 | 15 | 15 S 3 | 2.667 | 12.14 |

### B-VII.0

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| O-26 | 0 | 0+ | 4.000e-8 | 2.000e-8 | 4.500e-12 | 4.5 PS +32-34 | 8888 | 9810 |
| Ds-277 | 0 |  | 5 | 1.25 | 0.0035 | 3.5 MS +21-10 | 1428 | 2196 |
| Rf-265 | 0 |  | 4.680e+4 | 4680 | 60 | 1.0 M +12-3 | 779 | 646.9 |
| Rg-278 | 0 |  | 1 | 0.25 | 0.0042 | 4.2 MS +75-17 | 237.1 | 131.5 |
| Mn-60 | 0 | 1+ | 51 | 6 | 0.28 | 0.28 S 2 | 181.1 | 1316 |
| Pr-121 | 0 | (3/2) | 1.4 | 0.8 | 0.01 | 10 MS +6-3 | 139 | 167.8 |
| Bh-274 | 0 |  | 5400 | 1350 | 44 | 44 S +34-13 | 121.7 | 149.9 |
| Hs-273 | 0 |  | 50 | 12.5 | 0.51 | 0.51 S +30-13 | 97.04 | 151.8 |
| Sg-266 | 0 | 0+ | 21 | 16 | 0.34 | 0.34 S +19-9 | 60.76 | 64.31 |
| Mt-274 | 0 |  | 20 | 5 | 0.44 | 0.44 S +81-17 | 44.45 | 23.93 |
| Br-68 | 0 |  | 1.200e-6 | 0 | 3.500e-8 | 35 NS 5 | 33.29 | 233 |
| Bh-271 | 0 |  | 40 | 10 | 1.5 | 1.5 S +28-6 | 25.67 | 13.63 |
| Rb-72 | 0 |  | 1.200e-6 | 0 | 1.030e-7 | 103 NS 22 | 10.65 | 49.86 |
| Sg-264 | 0 | 0+ | 0.4 | 0.1 | 0.037 | 37 MS +27-11 | 9.811 | 12.72 |
| V-43 | 0 |  | 0.8 | 0 | 0.0793 | 79.3 MS 24 | 9.088 | 300.3 |
| Mn-62 | 0 | 1+ | 0.88 | 0.15 | 0.092 | 92 MS 13 | 8.565 | 38.69 |
| Tl-186 | 0 | (2-) | 27.5 | 1 | 3.4 | 3.4 S +5-4 | 7.088 | 46.79 |
| Kr-100 | 0 | 0+ | 0.052 | 0 | 0.007 | 7 MS +11-3 | 6.429 | 4.091 |
| Ag-93 | 0 |  | 1.500e-6 | 0 | 2.280e-7 | 228 NS 16 | 5.579 | 79.5 |
| Mg-35 | 0 | (3/2-,5/2-) | 0.07 | 0.04 | 0.0113 | 11.3 MS 6 | 5.195 | 9.052 |

### B-VI.8

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| Gd-164 | 0 | 0+ | 1301 | 0 | 45 | 45 S 3 | 27.92 | 418.8 |
| Ru-114 | 0 | 0+ | 8.136 | 0 | 0.54 | 0.54 S 3 | 14.07 | 253.2 |
| Eu-162 | 0 | (6+) | 162.4 | 0 | 11.4 | 11.4 S 6 | 13.25 | 251.7 |
| Sm-159 | 0 | 5/2- | 162 | 0 | 11.37 | 11.37 S 15 | 13.25 | 1004 |
| Pd-124 | 0 | 0+ | 0.514 | 0 | 0.038 | 38 MS +38-19 | 12.53 | 12.53 |
| Mo-110 | 0 | 0+ | 2.772 | 0 | 0.296 | 0.296 S 17 | 8.365 | 145.7 |
| Rh-115 | 0 | (7/2+) | 8.315 | 0 | 0.99 | 0.99 S 5 | 7.399 | 146.5 |
| Ru-116 | 0 | 0+ | 1.7 | 0 | 0.204 | 204 MS 6 | 7.335 | 249.4 |
| Mo-112 | 0 | 0+ | 0.9754 | 0 | 0.12 | 120 MS +13-11 | 7.128 | 65.8 |
| Pd-122 | 0 | 0+ | 1.411 | 0 | 0.175 | 175 MS 16 | 7.064 | 77.26 |
| Pd-120 | 0 | 0+ | 3.906 | 0 | 0.492 | 492 MS 33 | 6.94 | 103.5 |
| Ru-120 | 0 | 0+ | 0.3503 | 0 | 0.045 | 45 MS 2 | 6.784 | 152.6 |
| Sm-160 | 0 | 0+ | 72.58 | 0 | 9.6 | 9.6 S 3 | 6.56 | 209.9 |
| Kr-95 | 0 | 1/2(+) | 0.78 | 0 | 0.114 | 0.114 S 3 | 5.842 | 222 |
| Tc-111 | 0 | (5/2+) | 1.982 | 0 | 0.29 | 290 MS 20 | 5.836 | 84.62 |
| Ru-118 | 0 | 0+ | 0.6623 | 0 | 0.099 | 99 MS 3 | 5.69 | 187.8 |
| Mo-114 | 0 | 0+ | 0.3766 | 0 | 0.058 | 58 MS 2 | 5.494 | 159.3 |
| Pm-157 | 0 | (5/2-) | 61.18 | 0 | 10.56 | 10.56 S 12 | 4.794 | 421.9 |
| Ce-152 | 0 | 0+ | 7.663 | 0 | 1.4 | 1.4 S 2 | 4.473 | 31.31 |
| Pd-126 | 0 | 0+ | 0.252 | 0 | 0.0485 | 48.5 MS 7 | 4.196 | 290.7 |

### B-V

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| Re-187 | 0 | 5/2+ | 1.578e+18 | 0 | 1.366e+18 | 4.33E+10 Y 7 | 0.1549 | 9.581 |
| Eu-152 | 0 | 3- | 4.207e+8 | 1.262e+6 | 4.266e+8 | 13.517 Y 9 | -0.01384 | 4.502 |

### JEFF-3.3

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| Ag-93 | 0 |  | 0.005 | 0 | 2.280e-7 | 228 NS 16 | 2.193e+4 | 3.125e+5 |
| O-26 | 0 | 0+ | 4.000e-8 | 0 | 4.500e-12 | 4.5 PS +32-34 | 8888 | 1.176e+4 |
| Rf-265 | 0 |  | 4.680e+4 | 0 | 60 | 1.0 M +12-3 | 779 | 649.2 |
| Mn-60 | 0 | 1+ | 51 | 6 | 0.28 | 0.28 S 2 | 181.1 | 1316 |
| Ds-271 | 0 |  | 0.21 | 0.17 | 0.0016 | 1.6 MS +4-3 | 130.3 | 153.7 |
| Hs-273 | 0 |  | 50 | 0 | 0.51 | 0.51 S +30-13 | 97.04 | 165 |
| Sg-266 | 0 | 0+ | 21 | 6 | 0.34 | 0.34 S +19-9 | 60.76 | 96.82 |
| Pr-121 | 0 | (3/2) | 0.6 | 0.3 | 0.01 | 10 MS +6-3 | 59 | 75.54 |
| Br-68 | 0 |  | 1.500e-6 | 0 | 3.500e-8 | 35 NS 5 | 41.86 | 293 |
| Bi-185 | 0 | 1/2+ | 0.002 | 0 | 5.800e-5 | 58 US 4 | 33.48 | 485.5 |
| Mn-58 | 0 | 1+ | 65.2 | 0.5 | 3 | 3.0 S 1 | 20.73 | 606.2 |
| Rb-72 | 0 |  | 1.500e-6 | 0 | 1.030e-7 | 103 NS 22 | 13.56 | 63.5 |
| Tl-186 | 0 | (2-) | 40 | 0 | 3.4 | 3.4 S +5-4 | 10.76 | 73.2 |
| Sg-264 | 0 | 0+ | 0.4 | 0 | 0.037 | 37 MS +27-11 | 9.811 | 13.44 |
| Mn-62 | 0 | 1+ | 0.88 | 0.15 | 0.092 | 92 MS 13 | 8.565 | 38.69 |
| U-218 | 0 | 0+ | 0.006 | 0.005 | 6.500e-4 | 0.65 MS +8-7 | 8.231 | 9.771 |
| Rh-110 | 0 | (1+) | 28.5 | 1.5 | 3.35 | 3.35 S 12 | 7.507 | 117.9 |
| Mo-112 | 0 | 0+ | 1 | 0.2 | 0.12 | 120 MS +13-11 | 7.333 | 32.24 |
| Am-236 | 0 | 5- | 1800 | 0 | 216 | 3.6 M 2 | 7.333 | 132 |
| Ru-116 | 0 | 0+ | 1.7 | 0.3 | 0.204 | 204 MS 6 | 7.333 | 40.99 |

### JENDL-5

| State | Level (keV) | Jπ | Library (s) | ± | ENSDF (s) | ENSDF text | rel_diff | sigmas |
|---|---:|---|---:|---:|---:|---|---:|---:|
| Pr-121 | 0 | (3/2) | 1.4 | 0.8 | 0.01 | 10 MS +6-3 | 139 | 167.8 |
| Xe-136 | 0 | 0+ | 5.207e+30 | 1.925e+30 | 6.832e+28 | 2.165E21 Y 61 | 75.21 | 202.9 |
| Sg-266 | 0 | 0+ | 21 | 20 | 0.34 | 0.34 S +19-9 | 60.76 | 55.03 |
| Lr-251 | 0 | (7/2-) | 1.341 | 0 | 0.0244 | 24.4 MS +70-45 | 53.96 | 188.1 |
| Br-68 | 0 |  | 1.200e-6 | 0 | 3.500e-8 | 35 NS 5 | 33.29 | 233 |
| Rb-72 | 0 |  | 1.200e-6 | 0 | 1.030e-7 | 103 NS 22 | 10.65 | 49.86 |
| V-43 | 0 |  | 0.8 | 0 | 0.0793 | 79.3 MS 24 | 9.088 | 300.3 |
| Tl-186 | 0 | (2-) | 27.5 | 1 | 3.4 | 3.4 S +5-4 | 7.088 | 46.79 |
| Ag-93 | 0 |  | 1.500e-6 | 0 | 2.280e-7 | 228 NS 16 | 5.579 | 79.5 |
| Nh-285 | 0 |  | 5.5 | 5 | 0.93 | 0.93 S +45-23 | 4.914 | 4.772 |
| Cm-236 | 0 | 0+ | 1900 | 0 | 408 | 6.8 M 8 | 3.657 | 31.08 |
| Bi-188 | 0 | (3+) | 0.265 | 0.01 | 0.06 | 60 MS 3 | 3.417 | 54.54 |
| Re-172 | 0 | (5+) | 55 | 5 | 15 | 15 S 3 | 2.667 | 12.14 |
| Ge-59 | 0 |  | 0.0418 | 0 | 0.0133 | 13.3 MS 17 | 2.143 | 16.76 |
| Po-219 | 0 | (9/2+) | 3.000e-7 | 0 | 620 | 620 S 59 | -1 | 10.51 |
| Ge-62 | 0 | 0+ | 1.500e-7 | 0 | 0.0735 | 73.5 MS 1 | -1 | 735 |
| Co-51 | 0 | 7/2- | 2.000e-7 | 0 | 0.0688 | 68.8 MS 19 | -1 | 36.21 |
| Zn-56 | 0 | 0+ | 5.000e-7 | 0 | 0.0324 | 32.4 MS 11 | -1 | 29.45 |
| Sr-74 | 0 | 0+ | 1.200e-6 | 0 | 0.027 | 27 MS 8 | -1 | 3.375 |
| Rf-253 | 0 | (1/2+) | 5.150e-5 | 1.350e-5 | 0.0099 | 9.9 MS 12 | -0.9948 | 3.445 |
