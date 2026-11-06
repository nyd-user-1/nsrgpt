# Priority vs coverage, 2026-11-05

I matched the ranked nuclide/reaction pairs from the Nuclear Data Week decks to my copies of EXFOR (27,070 entries) and NSR (303,568 references). No new data was needed. There are 72 rows in `2026-11-05-priority-vs-coverage.csv`:

- 50 LANL pairs (Hutchinson). These are the pairs on his two lists, "MF33 absent" and "no processed covariance". The rank is his `user_rank` out of 701.
- 9 MIT rows (Ebiwonjumi), in the order of his table. Row 1 is W gamma heating, which is not a single reaction, so it has no counts.
- 13 PPPL nuclides. These came from photos with no reaction given, so I counted every neutron-induced measurement on the nuclide.

How I counted:

- **EXFOR entries:** entries where one reaction string names the isotope as the target together with the reaction. For example, `29-CU-63(N,EL)` counts toward Cu-63 elastic.
- **Natural targets:** measurements on the natural element (`29-CU-0(N,EL)`) are counted in a separate column.
- **NSR papers:** papers where the nuclide is tagged as a target in the same keyword selector as the reaction.
- **MT to reaction:** MT2 is N,EL (NSR writes (N,N)), MT4 is N,INL (NSR (N,N')), MT16 is N,2N, MT102 is N,G, MT103 is N,P, MT105 is N,T and MT107 is N,A.

Pairs with ten or fewer isotope-specific EXFOR entries:

| Rank | Source | Pair | EXFOR entries | NSR papers | EXFOR, natural target |
|---:|---|---|---:|---:|---:|
| 90 | LANL, both lists | W-184 (n,n') | 9 | 28 | 23 |
| 94 | LANL, both lists | W-186 (n,n') | 9 | 28 | 23 |
| 95 | LANL, both lists | W-182 (n,n') | 10 | 37 | 23 |
| 109 | LANL, both lists | W-183 (n,n') | 5 | 18 | 23 |
| 123 | LANL, MF33 absent | Hf-180 (n,n') | 7 | 22 | 4 |
| 138 | LANL, MF33 absent | Hf-178 (n,n') | 3 | 14 | 4 |
| 159 | LANL, MF33 absent | Hf-177 (n,n') | 0 | 2 | 4 |
| 163 | LANL, MF33 absent | Fe-57 (n,n') | 8 | 13 | 83 |
| 255 | LANL, no processed covariance | Cl-35 (n,n') | 3 | 10 | 6 |
| 297 | LANL, no processed covariance | W-183 (n,2n) | 2 | 11 | 5 |
| 304 | LANL, no processed covariance | Cl-37 (n,n') | 4 | 6 | 6 |
| 307 | LANL, no processed covariance | W-184 (n,2n) | 4 | 8 | 5 |
| 338 | LANL, no processed covariance | B-10 (n,t) | 5 | 14 | 2 |
| 352 | LANL, no processed covariance | W-182 (n,2n) | 10 | 17 | 5 |
| 3 | MIT | Pb-207 (n,2n) | 5 | 14 | 13 |
| 4 | MIT | Pb-206 (n,2n) | 7 | 16 | 13 |

The most thinly measured high-priority pairs are tungsten inelastic scattering and hafnium inelastic scattering:

- **Tungsten inelastic:** W-182, W-183, W-184 and W-186 sit at ranks 90 to 109, are on both of Hutchinson's lists, and have 5 to 10 entries each.
- **Hafnium inelastic:** Hf-177 has no isotope-specific entry at all, Hf-178 has 3 and Hf-180 has 7.

For MIT's PbLi blanket, Pb-207(n,2n) and Pb-206(n,2n) have only 5 and 7 entries, against 15 for Pb-208(n,2n).

The other pairs at ten entries or fewer are Cl-35 and Cl-37 inelastic, W-183 and W-184 (n,2n), and B-10(n,t).

Copper, iron and nickel elastic and inelastic look thin by isotope, but they have 39 to 112 entries each on natural targets:

- **Cu-63 elastic:** the top pair without MF33 has 13 isotope-specific entries.
- **Same pattern:** Al-27 (n,p) and (n,α), Co-59 capture and Au-197 elastic have 56 to 160 entries each.

For these pairs the missing covariance points to an evaluation gap more than a measurement gap.

Of PPPL's nuclides, W-180 has the fewest neutron measurements of any kind: 19 entries and 33 papers.
