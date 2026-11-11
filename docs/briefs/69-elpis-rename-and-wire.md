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
