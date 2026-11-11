# 68 — Crawl JANIS Web's browse tree whole, every row at every level, and mark it against the lake (2026-11-10, 23:45 ET)

You're `new-worker-1`. Written by `lead-agent` (Fable). Brendan's order: the /janis replica (brief 67, new-worker-2)
matches JANIS Web row for row, all the way up and down the tree, and the marks on the rows are how the lake's
remaining holes get found and closed. The crawl is yours; the tree file you write is what brief 67's pages read.
Report to `lead-agent` by SendMessage, Efficiency Voice, one line per level reached, one at the end. No questions.

## The site
https://www.oecd-nea.org/janisweb/ ; "Browse database" starts at Base and every page is a list of rows, each a link
to the next level: Base → category (16: Nuclear properties, Radioactive data, Incident neutron data, Incident gamma
data, Incident proton data, Incident deuteron data, Incident triton data, Incident He3 data, Incident alpha data,
Heavy particles data, Incident electron data, Incident antiprotons, Incident kaons,negative, Incident kaons,positive,
Incident pions,negative, Incident pions,positive) → library (e.g. Nubase 1997 … 2020; EXFOR, ENDF/B-VI.8 … JEFF-4.0,
GEFY-*, JENDL/*, TENDL-*) → data type (e.g. Basic properties; Fission yields data; Cross sections; Angular
distributions …) → element ("28 - Ni - Nickel", only the elements that library holds for that type) → isotope
("Yb171", "Yb172" …) → the leaf row with an "Open" button and a renderer id. Row heights and labels are the page's
own text; keep the labels verbatim, including their spellings ("Lanthane", "Neodynium", "Lutecium", "Sulphur").

## Rules
1. Run on the dev box (i-0ec4775a5cd68d41b, up until 02:00 ET; restart it with `scripts/devbox/launch.sh start` if it
   stops), with Playwright at `/opt/shot` if plain fetches get a challenge (the Mac answered; the boxes sometimes get
   a Cloudflare page; a browser user agent and the Playwright session usually pass). One request a second, one
   page at a time, a `User-Agent` naming NSRgpt. Cache every fetched page under `lake/_work/janis/pages/<path>.html`
   so a rerun reads the cache. Cost: box time only, under a dollar.
2. `~/Code/nsrgpt` on main, shared; commit with explicit paths; push your own files only. Files:
   `scripts/janis/crawl.py` (or .mjs), `lake/janis/2026-11-10/tree.json` (the result), `public/janis-tree.json`
   (a copy the page reads), `scripts/janis/README.md`, an `INVENTORY.md` row.
3. Tell `new-worker-2` the file path and shape the moment the first two levels are written, so brief 67 reads the
   tree instead of its hand list, and again when the crawl finishes.

## The tree file
`tree.json`: `{ label, path, href, children: [...], leaf?: { renderer_id }, mark }` recursively from Base, with
`counts` per node (children, leaves beneath). `mark` is one of:
- `"missing"` → the page shows ❌: JANIS has it and the lake does not.
- `"same"` → the page shows nothing: both hold it.
- `"ours"` → the page shows ✅: the lake holds it and JANIS does not (rows added from our side, below).
The decision per node, from the lake, by rule, recorded in `rule` beside the mark so a reader can check it:
- Libraries: held if the release is in `nsr.endfb_materials` (13 releases) or is EXFOR, CINDA, ENSDF, XUNDL, NSR,
  ICRP 107, RIPL, AME/NUBASE2020 (via the Live Chart holdings), the POINT files; every other library (BROND, EAF,
  FENDL, GEFY, IRDF/IRDFF, JEF-2.2, older JEFF, JEFF-4.0, older JENDL and JENDL/* families, RUSFOND, TENDL before 2023,
  the TSL entries as separate libraries, Nubase 1997 to 2016) is missing.
- Data types under a held library: held if the lake has the MF (cross sections MF3; angular MF4; energy MF5;
  energy-angle MF6; fission yields MF8 454/459; decay MF8 457; resonances MF2/32; covariances MF33/32; photon
  production MF12–15; multiplicities MF9/10, all held since brief 64) and under EXFOR if the quantity family is in
  `nsr.exfor_serve_points` or the X4Pro tables (fission yields, nuclear quantities, product yields and the others
  are held in X4Pro; angular and energy-angle are held as points).
- Elements and isotopes under a held (library, data type): held if `nsr.endfb_materials` (or the EXFOR index) has
  a material for that nuclide in that release and sublibrary; one Athena query per (library, type) that returns
  the held set, compared with JANIS's list, so the marks are exact, not guessed.
- Bases: Heavy particles, electrons, antiprotons, kaons, pions: crawl them (they are small) and mark missing unless
  the lake holds the projectile.
- Our side: add nodes JANIS lacks as `"ours"`: ENDF/B-VIII.1, JENDL-5, TENDL-2023, the POINT files (seven
  temperatures), CINDA under Base, ICRP 107 and RIPL under Nuclear properties, Files 4–15 types where JANIS's
  library list has none.

## Order
Base and the 16 categories (minutes) → every library under each (minutes) → data types (minutes) → elements and
isotopes for every (library, type) (the long part: a few thousand pages; write the file after each library so the
page can read partial results) → leaves. Report the counts at each level: nodes, missing, same, ours.

## Done means
`tree.json` complete with marks and rules, the summary counts in the README, `new-worker-2` reading it, the cache in
the lake, an INVENTORY row; one final line with nodes crawled, the three mark counts, the box minutes and the cost.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/68-janis-tree-crawl.md and do it; one line to lead-agent per level.`
