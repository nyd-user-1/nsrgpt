# ICRP Publication 107 cross-check of the 15 decay chains (2026-11-09)

Ours: ENSDF 2026-11-05 ground states (`nsr.nuclide_serve_summary`). ICRP: Publication 107, the 2021 corrected NDX (`nsr.icrp107_daughters`, `icrp107_nuclides`). Both walked from the head the way the rail does: branches of at least 0.001% that keep A mod 4 and move Z by at most 2, down to stable. ICRP isomers are counted under their ground state. Flagged: a member in one source only, a different mode, branching over 1 percentage point apart, half-life over 1% apart. Script: `scripts/parse/icrp107/crosscheck.py`.

| Chain | Head | Members, ours | Members, ICRP | ICRP isomers | Differences |
| --- | --- | --- | --- | --- | --- |
| Thorium series (4n) | Th-232 | 12 | 12 | 0 | 1 |
| Neptunium series (4n+1) | Np-237 | 16 | 13 | 0 | 9 |
| Uranium series (4n+2) | U-238 | 18 | 18 | 1 | 2 |
| Actinium series (4n+3) | U-235 | 16 | 16 | 0 | 2 |
| Pu-241 chain | Pu-241 | 19 | 16 | 0 | 9 |
| U-232 chain | U-232 | 10 | 10 | 0 | 1 |
| Pu-238 chain | Pu-238 | 16 | 16 | 0 | 2 |
| Cm-244 chain | Cm-244 | 15 | 15 | 0 | 1 |
| Radon-222 progeny | Rn-222 | 12 | 12 | 0 | 2 |
| Sr-90 chain | Sr-90 | 3 | 3 | 0 | 0 |
| Cs-137 chain | Cs-137 | 2 | 2 | 1 | 0 |
| Mo-99 chain | Mo-99 | 3 | 3 | 1 | 0 |
| Mass 131 fission chain | Sn-131 | 5 | 4 | 2 | 1 |
| Mass 135 fission chain | Te-135 | 5 | 4 | 1 | 1 |
| Mass 140 fission chain | Xe-140 | 5 | 4 | 0 | 1 |

## Thorium series (4n)

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Th-232 | 1.400E10 y; α 100% → Ra-228 | 1.405E10 y; α 100% → Ra-228 |  |
| Ra-228 | 5.75 y; β− 100% → Ac-228 | 5.75 y; β− 100% → Ac-228 |  |
| Ac-228 | 6.15 h; β− 100% → Th-228 | 6.15 h; β− 100% → Th-228 |  |
| Th-228 | 1.912 y; α 100% → Ra-224 | 1.912 y; α 100% → Ra-224 |  |
| Ra-224 | 3.632 d; α 100% → Rn-220 | 3.66 d; α 100% → Rn-220 |  |
| Rn-220 | 55.61 s; α 100% → Po-216 | 55.6 s; α 100% → Po-216 |  |
| Po-216 | 144 ms; α 100% → Pb-212 | 145 ms; α 100% → Pb-212 |  |
| Pb-212 | 10.62 h; β− 100% → Bi-212 | 10.64 h; β− 100% → Bi-212 |  |
| Bi-212 | 1.009 h; β− 64.06% → Po-212; α 35.94% → Tl-208 | 1.009 h; β− 64.06% → Po-212; α 35.94% → Tl-208 |  |
| Po-212 | 294.3 ns; α 100% → Pb-208 | 299 ns; α 100% → Pb-208 | half-life 1.57% apart |
| Tl-208 | 3.053 m; β− 100% → Pb-208 | 3.053 m; β− 100% → Pb-208 |  |
| Pb-208 | stable | stable |  |

ENSDF modes not followed: 14C

## Neptunium series (4n+1)

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Np-237 | 2.144E6 y; α 100% → Pa-233 | 2.144E6 y; α 100% → Pa-233 |  |
| Pa-233 | 26.98 d; β− 100% → U-233 | 26.97 d; β− 100% → U-233 |  |
| U-233 | 1.592E5 y; α 100% → Th-229 | 1.592E5 y; α 100% → Th-229 |  |
| Th-229 | 7907 y; α 100% → Ra-225 | 7340 y; α 100% → Ra-225 | half-life 7.72% apart |
| Ra-225 | 14.9 d; β− 100% → Ac-225 | 14.9 d; β− 100% → Ac-225 |  |
| Ac-225 | 9.92 d; α 100% → Fr-221 | 10 d; α 100% → Fr-221 |  |
| Fr-221 | 4.9 m; α 100% → At-217; β− ? → Ra-221 | 4.9 m; α 100% → At-217 | branch to Ra-221 only in ours |
| At-217 | 32.6 ms; α 99.99% → Bi-213; β− 0.007% → Rn-217 | 32.3 ms; α 99.99% → Bi-213 | branch to Rn-217 only in ours |
| Ra-221 | 28 s; α 100% → Rn-217 | — | not in ICRP |
| Bi-213 | 45.59 m; α 2.14% → Tl-209; β− 97.86% → Po-213 | 45.59 m; β− 97.91% → Po-213; α 2.09% → Tl-209 |  |
| Rn-217 | 540 µs; α 100% → Po-213 | — | not in ICRP |
| Tl-209 | 2.162 m; β− 100% → Pb-209 | 2.161 m; β− 100% → Pb-209 |  |
| Po-213 | 3.706 µs; α 100% → Pb-209 | 4.2 µs; α 100% → Pb-209 | half-life 11.8% apart |
| Pb-209 | 3.234 h; β− 100% → Bi-209 | 3.253 h; β− 100% → Bi-209 |  |
| Bi-209 | 2.010E19 y; α 100% → Tl-205 | stable | stable in ICRP; branch to Tl-205 only in ours |
| Tl-205 | stable | — | not in ICRP |

ENSDF modes not followed: 14C, 24NE, 28MG

## Uranium series (4n+2)

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| U-238 | 4.468E9 y; α 100% → Th-234 | 4.468E9 y; α 100% → Th-234 |  |
| Th-234 | 24.16 d; β− 100% → Pa-234 | 24.1 d; β− 100% → Pa-234 |  |
| Pa-234 | 6.7 h; β− 100% → U-234 | 6.7 h; β− 100% → U-234 |  |
| U-234 | 2.455E5 y; α 100% → Th-230 | 2.455E5 y; α 100% → Th-230 |  |
| Th-230 | 7.558E4 y; α 100% → Ra-226 | 7.538E4 y; α 100% → Ra-226 |  |
| Ra-226 | 1600 y; α 100% → Rn-222 | 1600 y; α 100% → Rn-222 |  |
| Rn-222 | 3.822 d; α 100% → Po-218 | 3.824 d; α 100% → Po-218 |  |
| Po-218 | 3.097 m; α 99.98% → Pb-214; β− 0.02% → At-218 | 3.1 m; α 99.98% → Pb-214; β− 0.02% → At-218 |  |
| Pb-214 | 27.06 m; β− 100% → Bi-214 | 26.8 m; β− 100% → Bi-214 |  |
| At-218 | 1.28 s; α 99.95% → Bi-214; β− 0.05% → Rn-218 | 1.5 s; α 99.9% → Bi-214; β− 0.1% → Rn-218 | half-life 14.7% apart |
| Bi-214 | 19.71 m; β− 99.98% → Po-214; α 0.021% → Tl-210 | 19.9 m; β− 99.98% → Po-214; α 0.021% → Tl-210 |  |
| Rn-218 | 33.75 ms; α 100% → Po-214 | 35 ms; α 100% → Po-214 | half-life 3.57% apart |
| Po-214 | 163.5 µs; α 100% → Pb-210 | 164.3 µs; α 100% → Pb-210 |  |
| Tl-210 | 1.3 m; β− 100% → Pb-210 | 1.3 m; β− 100% → Pb-210 |  |
| Pb-210 | 22.2 y; β− 100% → Bi-210 | 22.2 y; β− 100% → Bi-210 |  |
| Bi-210 | 5.012 d; β− 100% → Po-210 | 5.013 d; β− 100% → Po-210 |  |
| Po-210 | 138.4 d; α 100% → Pb-206 | 138.4 d; α 100% → Pb-206 |  |
| Pb-206 | stable | stable |  |
| Pa-234m | — | 1.17 m; β− 99.84% → U-234; IT 0.16% → Pa-234 | isomer, ours collapses to ground state |

ENSDF modes not followed: 14C, 24NE

## Actinium series (4n+3)

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| U-235 | 7.040E8 y; α 100% → Th-231 | 7.040E8 y; α 100% → Th-231 |  |
| Th-231 | 1.065 d; β− 100% → Pa-231 | 1.063 d; β− 100% → Pa-231 |  |
| Pa-231 | 3.257E4 y; α 100% → Ac-227 | 3.276E4 y; α 100% → Ac-227 |  |
| Ac-227 | 21.77 y; β− 98.62% → Th-227; α 1.38% → Fr-223 | 21.77 y; β− 98.62% → Th-227; α 1.38% → Fr-223 |  |
| Th-227 | 18.7 d; α 100% → Ra-223 | 18.68 d; α 100% → Ra-223 |  |
| Fr-223 | 22 m; β− 99.99% → Ra-223; α 0.006% → At-219 | 22 m; β− 100% → Ra-223; α 0.006% → At-219 |  |
| Ra-223 | 11.43 d; α 100% → Rn-219 | 11.43 d; α 100% → Rn-219 |  |
| At-219 | 56 s; α 93.6% → Bi-215; β− 6.4% → Rn-219 | 56 s; α 97% → Bi-215 | branch to Rn-219 only in ours; branch to Bi-215 3.4 points apart |
| Rn-219 | 3.96 s; α 100% → Po-215 | 3.96 s; α 100% → Po-215 |  |
| Bi-215 | 7.6 m; β− 100% → Po-215 | 7.6 m; β− 100% → Po-215 |  |
| Po-215 | 1.781 ms; α 100% → Pb-211 | 1.781 ms; α 100% → Pb-211 |  |
| Pb-211 | 36.1 m; β− 100% → Bi-211 | 36.1 m; β− 100% → Bi-211 |  |
| Bi-211 | 2.14 m; β− 0.276% → Po-211; α 99.72% → Tl-207 | 2.14 m; α 99.72% → Tl-207; β− 0.276% → Po-211 |  |
| Po-211 | 516 ms; α 100% → Pb-207 | 516 ms; α 100% → Pb-207 |  |
| Tl-207 | 4.77 m; β− 100% → Pb-207 | 4.77 m; β− 100% → Pb-207 |  |
| Pb-207 | stable | stable |  |

ENSDF modes not followed: 14C, 20NE, 25NE, 28MG

## Pu-241 chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Pu-241 | 14.33 y; β− 100% → Am-241; α 0.00247% → U-237 | 14.35 y; β− 100% → Am-241; α 0.00245% → U-237 |  |
| Am-241 | 432.6 y; α 100% → Np-237 | 432.2 y; α 100% → Np-237 |  |
| U-237 | 6.752 d; β− 100% → Np-237 | 6.75 d; β− 100% → Np-237 |  |
| Np-237 | 2.144E6 y; α 100% → Pa-233 | 2.144E6 y; α 100% → Pa-233 |  |
| Pa-233 | 26.98 d; β− 100% → U-233 | 26.97 d; β− 100% → U-233 |  |
| U-233 | 1.592E5 y; α 100% → Th-229 | 1.592E5 y; α 100% → Th-229 |  |
| Th-229 | 7907 y; α 100% → Ra-225 | 7340 y; α 100% → Ra-225 | half-life 7.72% apart |
| Ra-225 | 14.9 d; β− 100% → Ac-225 | 14.9 d; β− 100% → Ac-225 |  |
| Ac-225 | 9.92 d; α 100% → Fr-221 | 10 d; α 100% → Fr-221 |  |
| Fr-221 | 4.9 m; α 100% → At-217; β− ? → Ra-221 | 4.9 m; α 100% → At-217 | branch to Ra-221 only in ours |
| At-217 | 32.6 ms; α 99.99% → Bi-213; β− 0.007% → Rn-217 | 32.3 ms; α 99.99% → Bi-213 | branch to Rn-217 only in ours |
| Ra-221 | 28 s; α 100% → Rn-217 | — | not in ICRP |
| Bi-213 | 45.59 m; α 2.14% → Tl-209; β− 97.86% → Po-213 | 45.59 m; β− 97.91% → Po-213; α 2.09% → Tl-209 |  |
| Rn-217 | 540 µs; α 100% → Po-213 | — | not in ICRP |
| Tl-209 | 2.162 m; β− 100% → Pb-209 | 2.161 m; β− 100% → Pb-209 |  |
| Po-213 | 3.706 µs; α 100% → Pb-209 | 4.2 µs; α 100% → Pb-209 | half-life 11.8% apart |
| Pb-209 | 3.234 h; β− 100% → Bi-209 | 3.253 h; β− 100% → Bi-209 |  |
| Bi-209 | 2.010E19 y; α 100% → Tl-205 | stable | stable in ICRP; branch to Tl-205 only in ours |
| Tl-205 | stable | — | not in ICRP |

ENSDF modes not followed: 14C, 24NE, 28MG

## U-232 chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| U-232 | 68.9 y; α 100% → Th-228 | 68.9 y; α 100% → Th-228 |  |
| Th-228 | 1.912 y; α 100% → Ra-224 | 1.912 y; α 100% → Ra-224 |  |
| Ra-224 | 3.632 d; α 100% → Rn-220 | 3.66 d; α 100% → Rn-220 |  |
| Rn-220 | 55.61 s; α 100% → Po-216 | 55.6 s; α 100% → Po-216 |  |
| Po-216 | 144 ms; α 100% → Pb-212 | 145 ms; α 100% → Pb-212 |  |
| Pb-212 | 10.62 h; β− 100% → Bi-212 | 10.64 h; β− 100% → Bi-212 |  |
| Bi-212 | 1.009 h; β− 64.06% → Po-212; α 35.94% → Tl-208 | 1.009 h; β− 64.06% → Po-212; α 35.94% → Tl-208 |  |
| Po-212 | 294.3 ns; α 100% → Pb-208 | 299 ns; α 100% → Pb-208 | half-life 1.57% apart |
| Tl-208 | 3.053 m; β− 100% → Pb-208 | 3.053 m; β− 100% → Pb-208 |  |
| Pb-208 | stable | stable |  |

ENSDF modes not followed: 14C, 24NE

## Pu-238 chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Pu-238 | 87.7 y; α 100% → U-234 | 87.7 y; α 100% → U-234 |  |
| U-234 | 2.455E5 y; α 100% → Th-230 | 2.455E5 y; α 100% → Th-230 |  |
| Th-230 | 7.558E4 y; α 100% → Ra-226 | 7.538E4 y; α 100% → Ra-226 |  |
| Ra-226 | 1600 y; α 100% → Rn-222 | 1600 y; α 100% → Rn-222 |  |
| Rn-222 | 3.822 d; α 100% → Po-218 | 3.824 d; α 100% → Po-218 |  |
| Po-218 | 3.097 m; α 99.98% → Pb-214; β− 0.02% → At-218 | 3.1 m; α 99.98% → Pb-214; β− 0.02% → At-218 |  |
| Pb-214 | 27.06 m; β− 100% → Bi-214 | 26.8 m; β− 100% → Bi-214 |  |
| At-218 | 1.28 s; α 99.95% → Bi-214; β− 0.05% → Rn-218 | 1.5 s; α 99.9% → Bi-214; β− 0.1% → Rn-218 | half-life 14.7% apart |
| Bi-214 | 19.71 m; β− 99.98% → Po-214; α 0.021% → Tl-210 | 19.9 m; β− 99.98% → Po-214; α 0.021% → Tl-210 |  |
| Rn-218 | 33.75 ms; α 100% → Po-214 | 35 ms; α 100% → Po-214 | half-life 3.57% apart |
| Po-214 | 163.5 µs; α 100% → Pb-210 | 164.3 µs; α 100% → Pb-210 |  |
| Tl-210 | 1.3 m; β− 100% → Pb-210 | 1.3 m; β− 100% → Pb-210 |  |
| Pb-210 | 22.2 y; β− 100% → Bi-210 | 22.2 y; β− 100% → Bi-210 |  |
| Bi-210 | 5.012 d; β− 100% → Po-210 | 5.013 d; β− 100% → Po-210 |  |
| Po-210 | 138.4 d; α 100% → Pb-206 | 138.4 d; α 100% → Pb-206 |  |
| Pb-206 | stable | stable |  |

ENSDF modes not followed: 14C, 24NE

## Cm-244 chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Cm-244 | 18.11 y; α 100% → Pu-240 | 18.1 y; α 100% → Pu-240 |  |
| Pu-240 | 6561 y; α 100% → U-236 | 6564 y; α 100% → U-236 |  |
| U-236 | 2.342E7 y; α 100% → Th-232 | 2.342E7 y; α 100% → Th-232 |  |
| Th-232 | 1.400E10 y; α 100% → Ra-228 | 1.405E10 y; α 100% → Ra-228 |  |
| Ra-228 | 5.75 y; β− 100% → Ac-228 | 5.75 y; β− 100% → Ac-228 |  |
| Ac-228 | 6.15 h; β− 100% → Th-228 | 6.15 h; β− 100% → Th-228 |  |
| Th-228 | 1.912 y; α 100% → Ra-224 | 1.912 y; α 100% → Ra-224 |  |
| Ra-224 | 3.632 d; α 100% → Rn-220 | 3.66 d; α 100% → Rn-220 |  |
| Rn-220 | 55.61 s; α 100% → Po-216 | 55.6 s; α 100% → Po-216 |  |
| Po-216 | 144 ms; α 100% → Pb-212 | 145 ms; α 100% → Pb-212 |  |
| Pb-212 | 10.62 h; β− 100% → Bi-212 | 10.64 h; β− 100% → Bi-212 |  |
| Bi-212 | 1.009 h; β− 64.06% → Po-212; α 35.94% → Tl-208 | 1.009 h; β− 64.06% → Po-212; α 35.94% → Tl-208 |  |
| Po-212 | 294.3 ns; α 100% → Pb-208 | 299 ns; α 100% → Pb-208 | half-life 1.57% apart |
| Tl-208 | 3.053 m; β− 100% → Pb-208 | 3.053 m; β− 100% → Pb-208 |  |
| Pb-208 | stable | stable |  |

ENSDF modes not followed: 14C

## Radon-222 progeny

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Rn-222 | 3.822 d; α 100% → Po-218 | 3.824 d; α 100% → Po-218 |  |
| Po-218 | 3.097 m; α 99.98% → Pb-214; β− 0.02% → At-218 | 3.1 m; α 99.98% → Pb-214; β− 0.02% → At-218 |  |
| Pb-214 | 27.06 m; β− 100% → Bi-214 | 26.8 m; β− 100% → Bi-214 |  |
| At-218 | 1.28 s; α 99.95% → Bi-214; β− 0.05% → Rn-218 | 1.5 s; α 99.9% → Bi-214; β− 0.1% → Rn-218 | half-life 14.7% apart |
| Bi-214 | 19.71 m; β− 99.98% → Po-214; α 0.021% → Tl-210 | 19.9 m; β− 99.98% → Po-214; α 0.021% → Tl-210 |  |
| Rn-218 | 33.75 ms; α 100% → Po-214 | 35 ms; α 100% → Po-214 | half-life 3.57% apart |
| Po-214 | 163.5 µs; α 100% → Pb-210 | 164.3 µs; α 100% → Pb-210 |  |
| Tl-210 | 1.3 m; β− 100% → Pb-210 | 1.3 m; β− 100% → Pb-210 |  |
| Pb-210 | 22.2 y; β− 100% → Bi-210 | 22.2 y; β− 100% → Bi-210 |  |
| Bi-210 | 5.012 d; β− 100% → Po-210 | 5.013 d; β− 100% → Po-210 |  |
| Po-210 | 138.4 d; α 100% → Pb-206 | 138.4 d; α 100% → Pb-206 |  |
| Pb-206 | stable | stable |  |

## Sr-90 chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Sr-90 | 28.91 y; β− 100% → Y-90 | 28.79 y; β− 100% → Y-90 |  |
| Y-90 | 2.669 d; β− 100% → Zr-90 | 2.671 d; β− 100% → Zr-90 |  |
| Zr-90 | stable | stable |  |

## Cs-137 chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Cs-137 | 30.08 y; β− 100% → Ba-137 | 30.17 y; β− 100% → Ba-137 |  |
| Ba-137 | stable | stable |  |
| Ba-137m | — | 2.552 m; IT 100% → Ba-137 | isomer, ours collapses to ground state |

## Mo-99 chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Mo-99 | 2.747 d; β− 100% → Tc-99 | 2.748 d; β− 100% → Tc-99 |  |
| Tc-99 | 2.111E5 y; β− 100% → Ru-99 | 2.111E5 y; β− 100% → Ru-99 |  |
| Ru-99 | stable | stable |  |
| Tc-99m | — | 6.015 h; IT 100% → Tc-99; β− 0.0037% → Ru-99 | isomer, ours collapses to ground state |

## Mass 131 fission chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Sn-131 | 56 s; β− 100% → Sb-131 | — | head not in ICRP |
| Sb-131 | 23.03 m; β− 100% → Te-131 | 23.03 m; β− 100% → Te-131 |  |
| Te-131 | 25 m; β− 100% → I-131 | 25 m; β− 100% → I-131 |  |
| I-131 | 8.025 d; β− 100% → Xe-131 | 8.021 d; β− 100% → Xe-131 |  |
| Xe-131 | stable | stable |  |
| Te-131m | — | 1.25 d; β− 77.8% → I-131; IT 22.2% → Te-131 | isomer, ours collapses to ground state |
| Xe-131m | — | 11.84 d; IT 100% → Xe-131 | isomer, ours collapses to ground state |

## Mass 135 fission chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Te-135 | 19 s; β− 100% → I-135 | — | head not in ICRP |
| I-135 | 6.58 h; β− 100% → Xe-135 | 6.57 h; β− 100% → Xe-135 |  |
| Xe-135 | 9.14 h; β− 100% → Cs-135 | 9.14 h; β− 100% → Cs-135 |  |
| Cs-135 | 2.300E6 y; β− 100% → Ba-135 | 2.300E6 y; β− 100% → Ba-135 |  |
| Ba-135 | stable | stable |  |
| Xe-135m | — | 15.29 m; IT 99.4% → Xe-135; β− 0.6% → Cs-135 | isomer, ours collapses to ground state |

## Mass 140 fission chain

| Nuclide | Ours | ICRP | Difference |
| --- | --- | --- | --- |
| Xe-140 | 13.6 s; β− 100% → Cs-140 | — | head not in ICRP |
| Cs-140 | 1.062 m; β− 100% → Ba-140 | 1.062 m; β− 100% → Ba-140 |  |
| Ba-140 | 12.75 d; β− 100% → La-140 | 12.75 d; β− 100% → La-140 |  |
| La-140 | 1.679 d; β− 100% → Ce-140 | 1.678 d; β− 100% → Ce-140 |  |
| Ce-140 | stable | stable |  |
