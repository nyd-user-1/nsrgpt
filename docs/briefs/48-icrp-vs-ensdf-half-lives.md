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
