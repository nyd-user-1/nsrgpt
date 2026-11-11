# 67 — /janis: an exact replica of JANIS Web's pages in NSRgpt's style, UI only, no data wired (2026-11-10, 23:10 ET)

You're `new-worker-2`. Written by `lead-agent` (Fable). Brendan's order: JANIS Web (oecd-nea.org/janisweb) is the
field's standard viewer and he wants our version of its pages, in our design system, for comparison, tonight. UI
only: no routes, no data, placeholder rows and a placeholder chart. It is a tree walk and a few panels; the home,
browse and search pages are minutes each, the book page is the one that takes a little longer. Report to
`lead-agent` by SendMessage, Efficiency Voice, one line per page with the box URL, one at the end. No questions.

## Reference, in hand
`~/Downloads/JANIS (11_10_2026 10：38：27 PM).html`, a SingleFile save of the JANIS Web home page with every style
inlined: read it for the exact structure. For the other pages Brendan's screenshots were read by the lead and are
described below in full. Walk the live site from the Mac for anything unclear (https://www.oecd-nea.org/janisweb/;
the boxes get challenged, the Mac doesn't).

## Rules
Mac rules; `~/Code/nsrgpt` on main, shared; commit with explicit paths; push your own files only. Types and lint on
the box (http://18.216.193.38:3000 until 02:00 ET); both themes. Files: `app/(site)/janis/**` (the routes below),
`components/janis/**`, `lib/janis-tree.ts` (the tree as data), the header titles, one sidebar row "JANIS" under
Main, one plate box ("JANIS Web's pages, ours."). Paper palette, the display face for titles, the sans for rows,
mono for codes; house hover states, house links; nothing captioned that the layout already says. The words
"badge" or "chip", never "pill"; nothing called "Mine" anywhere.

## Marks
Every row, button or panel for something we do not hold or serve gets a small red ❌ after its label (an emoji,
plain), so the page doubles as the gap list. What we hold tonight (from brief 59 and the night's briefs): NSR, ENSDF,
XUNDL, EXFOR (all quantities), CINDA, ENDF/B-VI.8 to VIII.1 with VIII.1 and the POINT files, JEFF-3.3, JENDL-5,
TENDL-2023, CENDL-3.2, ICRP 107, RIPL, stopping powers, BetaShape, resonances (File 2/32), covariances (File 33 and
32), Files 4 to 15 (angular, energy, energy-angle, multiplicities, photon production). Not held (mark ❌): BROND,
EAF, FENDL, GEFY, IRDF/IRDFF, JEF-2.2, older JEFF (3.0 to 3.2), JEFF-4.0, older JENDL (3.3, 4.0 and its families),
RUSFOND, TENDL before 2023, the TSL libraries as separate entries (we hold them inside each library), NUBASE as a
browsable base (we hold AME2020 masses and ENSDF), antiprotons, kaons, pions, heavy particles, electrons as a
separate base. The home page's "Open .jns file" and "TRANS Checker" cards get ❌.

## Pages
1. **`/janis`, home** (the SingleFile): a two-column grid of cards. Left: "Browse" (a tree icon, "Browse the
   database content", one wide button "Browse"), "Search" (six stacked wide buttons: ENDF, EXFOR, CINDA,
   Resonances, Decay lines, Covariances), "Open .jns file ❌" (a file input and Open). Right: "Books" ("Comparison of
   experimental and evaluated cross sections", seven stacked buttons: n neutron-induced, γ gamma-induced, p
   proton-induced, d deuteron-induced, t triton-induced, h helion-induced, α alpha-induced; the first selected),
   "TRANS Checker ❌" (one outline button "EXFOR TRANS Checker"). Cards in the paper-quiet tint with the house
   radius; the teal buttons become the house primary button. A top nav strip inside the page as theirs: JANIS Web
   mark, Browse, Search (menu), Books (menu), TRANS Checker.
2. **`/janis/browse[/...path]`, Browse database**: h2 "Browse database" (in the page, the header carries "JANIS"), a
   breadcrumb bar in the quiet tint ("Base / Nuclear properties / Nubase 1997 / Basic properties / n"), then a
   bordered list of rows, each a link in the house link colour, their row height (about 49 px), the whole path
   routed so the back button works. The tree, in `lib/janis-tree.ts`, exactly theirs:
   - Base → Nuclear properties, Radioactive data, Incident neutron data, Incident gamma data, Incident proton data,
     Incident deuteron data, Incident triton data, Incident He3 data, Incident alpha data, Heavy particles data ❌,
     Incident electron data ❌, Incident antiprotons ❌, Incident kaons,negative ❌, Incident kaons,positive ❌,
     Incident pions,negative ❌, Incident pions,positive ❌.
   - Nuclear properties → Nubase 1997 ❌, Nubase 2003 ❌, Nubase 2012 ❌, Nubase 2016 ❌, Nubase 2020 (we hold
     AME2020/NUBASE2020 through the Live Chart; no ❌) → Basic properties → the element list "0 - n - Neutron",
     "1 - H - Hydrogen" … through the table (all 118, from `lib` wherever the app keeps element symbols) → the
     nuclide row with an "Open" outline button and the nuclide name.
   - Radioactive data → EXFOR, ENDF/B-VI.8, ENDF/B-VII.0, ENDF/B-VII.1, ENDF/B-VIII.0, GEFY-3.3 ❌ … GEFY-9.1 ❌
     (3.3, 4.2, 5.2, 6.1, 6.2, 8.1, 9.1), JEF-2.2 ❌, JEFF-3.1 ❌, JEFF-3.1.1 ❌, JEFF-3.3, JEFF-4.0 ❌, JENDL-4.0 ❌,
     JENDL/DDF-2015 ❌, JENDL/FPD-2000 ❌, JENDL/FPD-2011 ❌, JENDL/FPY-2011 ❌, TENDL-2010 ❌. Under EXFOR: Angular
     distributions, Energy-angle distributions, Fission yields data, Differential fission neutron multiplicities,
     Fission neutron multiplicities, Gamma spectra, Kinetic energies, Most probable charge or mass, Nuclear
     quantities, Outgoing particle multiplicities, Partial differential data with respect to angle, Product yields;
     then an element list; then the nuclide row.
   - Incident neutron data → EXFOR, BROND-2.2 ❌, BROND-3.1 ❌, CENDL-2.1 ❌, CENDL-3.1 ❌, CENDL-3.2, EAF-2007 ❌,
     EAF-2010 ❌, ENDF/B-VI.8, ENDF/B-VI.8-HE ❌, ENDF/B-VII.0, ENDF/B-VII.1, ENDF/B-VIII.0, FENDL-2.1 ❌, FENDL-2.1
     MG ❌, FENDL-3.1b ❌, GEFY-3.3 … GEFY-9.1 ❌, IRDF-2002 ❌, IRDF-2002 MG ❌, IRDFF-1.0 ❌, IRDFF-1.0-640g ❌,
     IRDFF-1.05 ❌, IRDFF-II ❌, JEF-2.2 ❌, JEFF-3.0 ❌, JEFF-3.0/A ❌, JEFF-3.1 ❌, JEFF-3.1.1 ❌, JEFF-3.1.2 ❌,
     JEFF-3.2 ❌, JEFF-3.3, JEFF-4.0 ❌, JENDL-3.3 ❌, JENDL-4.0 ❌, JENDL-4.0/HE ❌, JENDL-4.0u ❌, JENDL/AC-2008 ❌,
     JENDL/AD-2017 ❌, JENDL/FPY-2011 ❌, JENDL/HE-2007 ❌, RUSFOND-2010 ❌, TENDL-2009 … TENDL-2019 ❌ (2009, 2010,
     2011, 2012, 2013, 2014, 2015, 2017, 2019), TSL ENDF/B-VI.8 ❌, TSL ENDF/B-VII.0 ❌, TSL JEFF-3.0 ❌, TSL JEFF-3.1 ❌.
     Add our own rows where JANIS has none, without ❌: ENDF/B-VIII.1, JENDL-5, TENDL-2023, the POINT files. Under a
     library: Cross sections, Angular distributions, Energy distributions, Energy-angle distributions, Fission yields,
     Resonance parameters, Covariances; then elements; then the nuclide row.
   - The other incident-particle bases: EXFOR, then the libraries we hold for that projectile (JEFF-3.3, JENDL-5,
     TENDL-2023, ENDF/B-VIII.1 where it has the sublibrary), same leaves.
3. **`/janis/search/{endf|exfor|cinda|resonances|decay|covariances}`**: each a form in their shape (target,
   reaction or quantity, energy range, library, year, author as each JANIS form has them; copy the fields from the
   live site), a Search button, an empty results table beneath with their column headers. No data.
4. **`/janis/book/{n|g|p|d|t|h|a}/[nuclide]/[mt]`, the books**: three-column layout as theirs. Left rail "By
   nuclide": a tree of elements (0-n, 1-H, 2-He …) that opens to isotopes (5-B-Nat, 5-B-10, 5-B-11) that open to
   MT rows (MT1 (n,total), MT2 (n,elastic), MT16 (n,2n), MT102 (n,γ), MT103 (n,p), MT105 (n,t), MT107 (n,α)), the
   selected one highlighted. Centre: the title bar ("<< 5-B-10 · 5-B-11 · 6-C-12 >>" and "<< MT105 (n,t) ·
   MT107 (n,α) or MT5 (Li8 production) · 6-C-Nat MT1 (n,total) >>" as prev/next links), a tab strip ("Home" and
   one tab named by the dataset ids), the chart (ECharts through `components/viz/use-echart.ts`, log-log, "Cross
   section" against "Incident energy", placeholder series: seven library lines in the dataviz palette and four
   EXFOR point sets with distinct markers, a legend box top-left as theirs), and beneath it the Node table with
   columns Node, Settings, Display and rows "NEA / Incident neutron data", "EXFOR / Cross sections / B11 /
   (,A)3-LI-8" with its subentries, then one row per library with "P T I" check boxes. Right rail: "Plotter" (X and
   Y scale selects Log/Lin, X min, X max, Y min, Y max inputs, Apply), "Cross section" (Reaction Q value), the two
   links "Additional EXFOR", "Additional ENDF". **Zoom box:** on the chart, mouse down and drag draws a selection
   rectangle, the cursor is the house crosshair (the one the other charts use), and on mouse up both axes zoom to
   the rectangle, proportionally, animated; the Plotter's min and max fields update; a double click resets. ECharts'
   `brush` with `toolbox.dataZoom` or a `dataZoom` set from the brush rectangle; whichever is already in use-echart.
   The chart draws placeholder data shaped like B-11 (n,α): a threshold rise then a slow fall.
5. The marks count: the home page's foot gets one line "❌ marks what I do not hold yet: N items." computed from the
   tree.

## Done means
Five routes on the box in both themes, every ❌ in place, the zoom box working, types and lint passing; one line to
lead-agent per page and one at the end with the ❌ count.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/67-janis-replica-ui.md and do it; one line to lead-agent per page.`
