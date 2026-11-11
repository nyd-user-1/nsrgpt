# 69 — Elpis: rename /janis to /elpis and wire every page to the lake (2026-11-11, 02:50 ET)

You're the worker Brendan pasted this into; call yourself `elpis-wire` in reports. Written by `lead-agent` (Fable).
Brendan's order, verbatim: "when I awake in the morning I'd like to see the janis surface renamed as elpis and see
that it has been completely wired up and is at least an exact mirror of janis... remember any row janis has we
have." Brief 67 built the pages UI only (placeholder series, placeholder rows, a dash for the Q value); brief 68
crawled JANIS's tree and marked every row against the lake. Tonight the pages read the lake. Report to
`lead-agent` by SendMessage, Efficiency Voice, one line per milestone below, one at the end. No questions: decide,
write the decision in the file's header comment, go.

## Rules
Mac rules (8 GB Air: no python3 locally, AWS CLI one call at a time, no local type checker; the hook blocks a
command line that names the linter, so keep box scripts in files and run them with `$(cat file)`). `~/Code/nsrgpt`
on main, shared with two other workers tonight (`elpis-fill` on data acquisition under `scripts/`, `lake/`, the
tree marks; `elpis-check` on `/elpis/checker` and `services/nsr-api/exfor_check*`): `git pull --rebase --autostash
origin main` before every commit, commit with explicit paths, push only your own files. Types and lint on the dev
box (http://3.145.136.49:3000; it stops itself at 07:00 ET; restart with `scripts/devbox/launch.sh start
i-0ec4775a5cd68d41b`, new IP, SSM up a minute later; it pulls origin every 20 s). CI is off (GitHub billing), so a
push reaches the box only; production is not touched tonight. Paper palette, display face for titles, sans for
rows, mono for codes; no captions that the layout already says; "badge" or "chip", never "pill"; nothing called
"Mine". First person singular wherever the page speaks.

## 1. The rename (first, one commit, 30 minutes)
- Routes `app/(site)/janis/**` → `app/(site)/elpis/**`; components `components/janis/**` → `components/elpis/**`
  (`ElpisHome`, `ElpisBrowse`, `ElpisSearch`, `ElpisBook`, `ElpisCounts`, `ElpisNav`); `lib/janis-tree.ts` stays
  (it describes JANIS's tree) but its page-facing helpers move to `lib/elpis.ts` if that reads cleaner; the sidebar
  row "JANIS" → "Elpis" (Tools); `lib/header-titles.ts`; page titles ("Elpis · n book · 12-Mg-Nat"); the plate box
  text; every `/janis/book` path test in `app/(site)/template.tsx`, `components/PageMotion.tsx`,
  `components/rail-toggle.tsx`, `components/viz/use-echart.ts`, `components/lab/OutputPane.tsx`,
  `components/nsr/graph/InsetPanel.tsx`, `components/sidebar/page-icons.ts`.
- Permanent redirects `/janis/:path*` → `/elpis/:path*` in `next.config` (Brendan's bookmarks and the tabs he has
  open).
- "JANIS" stays wherever it names NEA's product: the marks' meaning (❌ JANIS has it and I don't; ✅ I have it and
  JANIS doesn't), `/comparison`, `/about`'s For reference, `scripts/janis/*` (the crawler of JANIS),
  `public/janis-tree*` (JANIS's tree). The home page's line "JANIS Web's pages, ours" becomes Elpis's own line.
- Brief 66's comparison row and the About section keep their JANIS wording; add "Elpis" as the name of my viewer
  where they say "our JANIS pages".
Milestone line: `elpis-wire: renamed, redirects on, box <url>/elpis`.

## 2. What the lake serves tonight (read before wiring; nothing new to parse)
- Athena `nsr.*` (workgroup `nsrgpt`, helper pattern in `scripts/sweep/README.md`): `endfb_materials` (every
  material of the 13 releases with `release`, `sublibrary`, `mat`, `za`, `name`), `endfb_sections` (MF/MT per
  material), `endfb_xs_points` (MF3 points), `endfb_res_params`/`endfb_res_ranges` (MF2), `endfb_cov`/
  `endfb_res_cov` (MF33/32), `endfb_fy` (MF8 454/459), `endfb_decay`/`endfb_decay_modes`/`endfb_decay_lines`
  (MF8 457), `endfb_ang`/`endfb_edist`/`endfb_eang`/`endfb_mult`/`endfb_photon_*` (Files 4–15), `endf_serve_xs`/
  `endf_serve_materials`/`endf_serve_mt_names`; EXFOR `exfor_serve_points`/`exfor_serve_reactions`/
  `exfor_serve_targets`/`exfor_serve_quantities`/`exfor_serve_search_index`, the X4Pro tables (`exfor_x4pro_*`,
  `exfor_c5_*`), the dictionaries `exfor_dict_*`; ENSDF/XUNDL `*_levels`, `*_gammas`, `nuclide_serve_*`; ICRP 107
  `icrp107_*`; RIPL `ripl_*` (masses AME2020); `cinda_lines`; `iaea_ground_states` (Live Chart: AME/NUBASE2020).
- Releases held in `lake/endfb/<release>/`: B-II, B-III, B-IV, B-V, B-VI.8, B-VII.0, B-VII.1, B-VIII.0, B-VIII.1,
  CENDL-3.2, JEFF-3.3, JENDL-5, TENDL-2023, the POINT files (B-VII.1 at 293.6 K; B-VIII.0 and B-VIII.1 at 0, 293.6,
  600, 900, 1200, 1500, 1800 K). Sublibrary tokens: `neutrons`, `thermal_scatt`, `decay`, `nfy`, `sfy`, `gammas`,
  `protons`, `deuterons`, `tritons`, `helium3s`, `alphas`, `photoat`, `electrons`, `atomic_relax` (B-VI.8 uses
  `(root)`; see `scripts/parse/endfb/README.md`).
- nsr-api (`services/nsr-api/`, deployed by `deploy.sh`; README there): `/endf/xs?name=&mt=&sub=&release=&compare=
  &emin=&emax=` (structure.py `xs`), `/endf/section?release=&name=&mf=&mt=` and `/endf/section/laws`,
  `/endf/resonances`, `/endf/cov`, `/endf/fy`, `/endf/decay`, `/endf/materials?release=`, `/endf/mt`,
  `/endf/material`, `/exfor/points?target=&reaction=&quantity=&emin=&emax=`, `/exfor/search`, `/exfor/entry/<n>`
  (`/md`, `/pdf`, `/text`), `/exfor/subentry/<n>`, `/exfor/pickers/*`, `/nuclide/<name>`, `/ripl/levels`,
  `/ripl/masses`, `/icrp`, `/cinda*`, `/counts`, `/gnds`. The app reaches it through its proxy (`scripts/proxy`,
  the Lab's pattern in `components/lab/**`; copy how `components/lab` fetches, including the error states).
- The crawl: `public/janis-tree.json` (index) and `public/janis-tree/lib-NNN.json` (one library's subtree, loaded
  client-side by `use-crawl.ts`): every JANIS row with `mark` missing | same | ours and the `rule` that decided it.
  Lake copies at `lake/janis/2026-11-10/`. Counts at the root tonight: 22,315 leaves, 49,286 missing, 55,286 same,
  69 ours. `elpis-fill` will regenerate these files as libraries land; read them by path, never by position.

## 3. Wire the book (the page that matters most)
`/elpis/book/{n|g|p|d|t|h|a}/{nuclide}/{mt}`:
- **Series** from `/endf/xs` with `compare=` listing every held release that has (material, sublibrary, MT): one
  call, every library line real, the legend and the Series sheet listing only what came back (a library without
  the section is not drawn and not listed). Projectile → sublibrary: n→neutrons, g→gammas (and `photoat` for MT
  5xx), p→protons, d→deuterons, t→tritons, h→helium3s, a→alphas.
- **EXFOR points** from `/exfor/points` for the same target and reaction (quantity CS, SIG), one marker per
  subentry, the subentry id as the series name, author and year in the tooltip, the Series sheet row linking to
  `/exfor/subentry/<id>` (a page we serve). Honour the Lab's unit traps (`components/lab/**` comments: barns vs
  millibarns, eV vs MeV, ratios) exactly as the Lab does.
- **Range**: FULL comes from the data (energy min/max over the lines, cross-section min/max over positive values),
  not the B-11 constants. The Plotter's fields follow.
- **Q value** from MF3's head (QM, QI are in `endfb_sections` or the section route's header; check
  `endf_sections.py`), shown as JANIS shows it; the threshold line when QI < 0.
- **By nuclide rail** from the lake: for projectile p, every nuclide with a material in any held release's
  sublibrary, and under each the MTs with MF3 sections. Build it once per projectile as JSON by a script
  (`scripts/elpis/book-index.py`, one Athena query per projectile, written to `lake/elpis/<date>/book-<p>.json` and
  copied to `public/elpis/book-<p>.json`), read client-side like the crawl files. JANIS's MT rows for a nuclide are
  in the crawl under each library; any MT JANIS lists for a held nuclide that we have no section for is a ❌ row in
  the rail (keep the mark rule honest).
- **Steppers**: the row removed at 02:24 stays gone; the rail and the Plotter navigate.
- **Other files**: the book's Plotter links "Additional EXFOR" and "Additional ENDF" open `/elpis/search` prefilled
  with the nuclide and reaction.
Milestone line: `elpis-wire: book live, <n> nuclides × <m> MTs for n; sample <url>`.

## 4. Wire browse, search and home
- **Browse** keeps the crawl's rows and marks; a held leaf (library → data type → element → isotope) opens the
  book for that nuclide and MT where the type is cross sections, `/datasets/endf?release=…` or the matching
  dataset page for the other types (fission yields, decay, resonances, covariances, Files 4–15), and the EXFOR
  leaves open `/exfor/search` results for that target and quantity. Each held row shows its count from the lake
  (materials, or points) in the muted figure column JANIS uses; a ❌ row shows nothing.
- **Search**: the forms in `search-forms.ts` post to `/exfor/search`, `/endf/materials` + `/endf/section` and
  `/cinda` with results tables in the house table, each row opening its page. Keep every JANIS search field; a
  field we cannot honour gets ❌ after its label, not silently dropped.
- **Home**: the Browse card's counts from `/counts` and the crawl root; the Books card lists the seven projectiles
  with their nuclide counts from the book index; the TRANS Checker card links to `/elpis/checker` (`elpis-check`
  builds it tonight; link it now, the route may land after you); the .jns card stays disabled (a JANIS file
  format, not mine).
Milestone lines per page.

## 5. QA (yours, not the lead's; the lead only spot-checks)
- On the box, drive 40 book pages chosen at random from the index across all seven projectiles (Playwright is at
  /opt/shot; the pattern is in `scripts/devbox/`): every one renders real lines, no console errors, the legend
  lists what is drawn, the sheet rows link, the Q value is a number or a dash with a reason. Screenshot ten in both
  themes to `lake/_work/elpis/qa/` and list the URLs in your report.
- Compare three pages against JANIS Web from the Mac (the boxes get challenged): U-235 (n,f), Fe-56 (n,tot),
  B-11 (n,α): same libraries drawn, same EXFOR subentries listed, same Q value. Note every difference.
- Types and lint clean on the box; both themes; rails closed on load; no animation on rail or Plotter clicks.

## Done means
`/elpis/**` live on the box with every page reading the lake; the redirects; the book index files in `public/elpis/`
and the lake; the 40-page drive and the three JANIS comparisons in the report; `docs/briefs/69-…` gets a
"## Report" section at its foot (commits, counts, what JANIS shows that I do not, what I show that JANIS does not);
an INVENTORY.md row; memory not yours to write. One final line: pages, nuclides × MTs per projectile, EXFOR sets
linked, differences from JANIS, box minutes.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/69-elpis-rename-and-wire.md and do it; one line to lead-agent per milestone.`

## Report (elpis-wire, 2026-11-11 05:10 ET)

**Commits.**
- `816d0e2` the rename, with redirects from `/janis` and `/janis/*`.
- `51b0332` the lead's sidebar icon and plate names, carried.
- `6c1a4e3` book, browse, search and home wired.
- `c3c2629` and `322ec81` the chart's range.
- `7ddffeb` search row keys.
- `aac0cb9` Q values written as JANIS writes them.
- `151dc2d` and `6679c92` the crawl read from the CDN, with the repo copy as fallback.
- `7c14869` browse figures.

Types and lint are clean on the box for every commit.

**Book index** (`public/elpis/book-<p>.json`; lake `lake/elpis/2026-11-11/`). JANIS's rails were crawled from its book pages: 7 books, 1,396 nuclides, 7,292 pages, no errors. Every nuclide JANIS's books list is one I hold.

| Book | Nuclides I hold | JANIS's nuclides | MTs both | ❌ JANIS only | ✅ mine only |
| --- | --- | --- | --- | --- | --- |
| n | 2,912 | 533 | 2,423 | 143 | 230,935 |
| γ | 3,484 | 177 | 346 | 45 | 70,185 |
| p | 2,925 | 236 | 1,009 | 737 | 83,268 |
| d | 2,889 | 158 | 486 | 199 | 91,024 |
| t | 2,866 | 19 | 20 | 11 | 88,846 |
| h | 2,882 | 76 | 351 | 174 | 88,490 |
| α | 2,884 | 197 | 717 | 631 | 65,171 |

**QA on the box.**
- **40 random book pages** across the seven books (seed 69; 10 n, 5 γ, 6 p, 5 d, 4 t, 5 h, 5 α):
  - All 40 draw real lines: 1 to 13 libraries, EXFOR sets where EXFOR has them.
  - The legend lists what is drawn.
  - The Q value is a number on all 40.
  - Every EXFOR sheet row links to `/datasets/exfor/<id>`.
  - No console errors, except React's hydration warning on 2 of about 50 loads; it did not recur on reload.
  - Ten pages in both themes are in `lake/_work/elpis/qa/`, with the run logs (`run1`–`run4.jsonl`): n/53-I-125/102, n/33-As-75/4, n/41-Nb-102/62, g/77-Ir-181/102, p/30-Zn-64/105, p/83-Bi-196m/106, d/24-Cr-53/4, t/42-Mo-101/25, h/77-Ir-178/117, a/49-In-127/42.
  - Rails are closed on load. The Plotter, rail clicks and data loads redraw without animation; only the zoom box animates.
- **Search** (one test per form):
  - EXFOR B-11 (n,α): 14 rows.
  - ENDF B-11 MT107: 10 rows.
  - CINDA B-11: 100 rows.
  - Resonances Fe-56: 2,769 rows.
  - Decay lines Co-60: 323 rows.
  - Covariances U-235: 372 rows.
- **Browse.**
  - Isotope rows open the book (cross sections), `/datasets/endf?name=&release=` (the other types) or Elpis's EXFOR search (EXFOR rows).
  - The figure column reads: Fe-56 under ENDF/B-VIII.0 cross sections, 37.4K File 3 points; under EXFOR cross sections, 55.4K points.

**Against JANIS Web** (its book pages and data cards, read from the Mac).
- **B-11 (n,α)**
  - EXFOR: the same 4 subentries (11219.002, 20833.002, 23457.002, 30530.005). I also list 5 I do not draw: one ratio, three PAR,SIG and one with no points.
  - Q value: the same, −6.63095 MeV.
  - Libraries in both: CENDL-3.2, ENDF/B-VIII.0, JEFF-3.3.
  - JANIS only: BROND-3.1, EAF-2010, JENDL-4.0u, TENDL-2019.
  - Mine only: ENDF/B-VIII.1, JENDL-5, TENDL-2023, ENDF/B-VII.1, VII.0, VI.8, V, IV, III.
- **Fe-56 (n,total)**
  - EXFOR: the same 16 subentries.
  - Q value: the same, 0 eV.
  - Libraries in both: CENDL-3.2, ENDF/B-VIII.0, JEFF-3.3.
  - JANIS only: BROND-3.1, JENDL-4.0u, JENDL/HE-2007, TENDL-2019.
  - Mine only: ENDF/B-VIII.1, JENDL-5, TENDL-2023, ENDF/B-VII.1, VII.0, VI.8.
- **U-235 (n,f)**
  - JANIS's page answered 504 twice, then loaded in 20 s.
  - EXFOR: JANIS lists 228; I hold 262 in barns with points; 223 are in both.
    - JANIS only: 5 (23453.016, 40070.039.1, 40156.004, 40218.002, 40588.003). I hold their entries but serve no points for them.
    - Mine only: 39.
    - Two of my eight energy windows pass 50,000 points, so the page draws 254 of my 262.
  - Q value: JANIS shows 193.4054 MeV, from ENDF/B-VIII.0. I show 194.077 MeV, from ENDF/B-VIII.1, the first library I draw; my ENDF/B-VIII.0 value is 193.4054 MeV.
  - Libraries in both: CENDL-3.2, ENDF/B-VIII.0, JEFF-3.3.
  - JANIS only: BROND-3.1, EAF-2010, IRDFF-II, JENDL-4.0u, JENDL/HE-2007, TENDL-2019.
  - Mine only: ENDF/B-VIII.1, JENDL-5, TENDL-2023, ENDF/B-VII.1, VII.0, VI.8, V, IV, III, II.

**What JANIS shows that I do not.**
- **Reconstructed curves inside the resolved resonance range for every library.** My lines for JEFF-3.3, JENDL-5, ENDF/B-VII.1 and older, TENDL-2023 and CENDL-3.2 are File 3 as evaluated: the background only. The sheet says so line by line. ENDF/B-VIII.x come from POINT at 0 K.
- **Libraries the lake now holds but `/endf/xs` does not serve:** BROND-3.1, EAF-2010, IRDFF-II, JENDL-4.0/HE, FENDL, JEFF-4.0 and the rest of elpis-fill's additions. They are in the book index already and draw once `RELEASES` in `services/nsr-api/structure.py` and their serve tables include them.
- **1,940 book MTs** (❌ in the rails), most of them charged-particle channels JANIS fills from its own processing.
- **JANIS's own UI controls.** The sheet's Settings column (P, T, I) is now a Points column. Search results have no row checkboxes for plotting.
- **Search fields marked ❌:** quantity group, title, 1st author, reference type, main reference and code, area, country, BOXER, Material #2, Reaction #2.
- **Searches without a nuclide.** Resonances and Decay lines need a target nuclide; the ENDF and Covariances forms need one to list sections.
- **Every EXFOR set on a page.** Points past 50,000 in one energy window are not drawn, and the sheet says so.

**What I show that JANIS does not.**
- ENDF/B-VIII.1, JENDL-5, TENDL-2023 and the older ENDF/B releases on every page.
- 718,000 MT rows JANIS's books do not list: levels, MT 5, partial and production MTs.
- 39 more U-235 (n,f) subentries.
- The threshold line.
- Per-line notes: POINT, or background only.
- The list of EXFOR sets not drawn, with the reason for each.
- The lake's figures beside each browse row.

**Open.**
- **Crawl from the CDN.** The browser gets no CORS header on `/lake/*` (CDP shows `MissingAllowOriginHeader`; curl gets the header). elpis-fill has the evidence. Until it's fixed, `use-crawl.ts` falls back to `public/janis-tree*`, so those files must stay until it passes.
- **Stale marks.** The crawl still marks EAF-2010 and CENDL-3.1 ❌ although the lake holds them; elpis-fill's next mark run.

**Box minutes:** about 55: twelve type and lint runs, and the QA drives.
