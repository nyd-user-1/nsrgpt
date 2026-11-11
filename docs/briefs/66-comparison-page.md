# 66 — /comparison: NSRgpt beside NNDC, IAEA-NDS and NEA, feature by feature, in the grouped comparison table (2026-11-10, 22:30 ET)

You're `new-worker-1`. Written by `lead-agent` (Fable). Brendan wants a page that puts NSRgpt beside the nuclear data
centers, in the shape of shadcn's grouped comparison table (shadcn.io/view/pricing/grouped-comparison-table), kept
exactly in its row heights and expand-collapse behaviour and re-dressed in NSRgpt's design system. Report to
`lead-agent` by SendMessage, Efficiency Voice, one line per part, one at the end with the box URL. No questions.

## The reference, in hand
- `~/Downloads/comparison.pretty.html`: the rendered DOM of the shadcn page, beautified (750 lines, 82 rows, 10
  groups). Read it first. The pieces to keep, by their classes: `cn-table` fixed layout, label column `w-[38%]
  md:w-56 lg:w-64`; a header `th` per plan `px-3 pt-5 pb-0 align-bottom` holding name (`font-semibold`), a
  one-line sub (`text-muted-foreground text-xs`), the price line, and a full-width button; one `tbody` per group;
  the group row `border-y bg-muted/50` whose first cell is a ghost button `h-auto w-full justify-start gap-2 px-4
  py-3 text-start` with `aria-expanded`, a `chevron-down size-4` that rotates, the group name `font-semibold text-sm`
  and its count `text-muted-foreground text-xs tabular-nums`, and per plan column a "n of m" cell `text-xs
  tabular-nums text-muted-foreground`; feature rows `hover:bg-muted` with the label cell `px-4 py-2.5 font-normal`
  and value cells `px-3 md:px-4 text-center`, a `check size-4` (text-foreground), a `minus size-4`
  (text-muted-foreground) or a `font-medium text-xs tabular-nums` value; the recommended column's cells `bg-muted/50`
  with `border-s` between columns; "Expand all" top right toggling every group; `motion-reduce` on the chevron.
- The shadcn source is open: `npx shadcn@latest view pricing-grouped-comparison-table` (or the registry entry the
  page names) gives the React component; port it (EV rule 17), then re-dress. The DOM copy is the check on heights
  and spacing: measure its row heights in the pretty file's classes and keep them to the pixel.

## Re-dress for NSRgpt
`--paper-*` tokens for every colour (`bg-muted` → `var(--paper-quiet)`, `text-muted-foreground` →
`var(--paper-muted)`, borders `var(--paper-rule)`), the app's type (the display face for the column names as the
header titles use it, the sans for cells, the mono for tabular values), the house hover states (the Button
circle's hover, the rail rows' hover), links in the house link style, both themes. The recommended column is
NSRgpt, tinted as "Business" is in the reference, with a "Mine" pill where "Best value" sits. Header title
"Comparison" (`lib/header-titles.ts`, brief 38: no h1 in the page), the one-line sub under it in the page's first row
("What each site holds and does, verified on the date shown."), sidebar row under Main, plate box ("NSRgpt beside
NNDC, IAEA-NDS and NEA, feature by feature."). The page is static; the matrix is a typed table in `lib/comparison.ts`
with a `checked` date per row.

## The columns (four; a fifth only if every cell in it is verified)
1. **NSRgpt** (recommended column): "Find, read, connect and work with nuclear data. In seconds." Price line "Free
   to read; sign in to run". Button "Open" → `/`.
2. **NNDC**: "National Nuclear Data Center, Brookhaven". "Free". Button → https://www.nndc.bnl.gov. Its tools:
   NuDat 3, Sigma, ENSDF, XUNDL, NSR, CSEWG, the ENDF/B releases.
3. **IAEA-NDS**: "Nuclear Data Section, Vienna". "Free". Button → https://nds.iaea.org. Its tools: Live Chart,
   EXFOR, the ENDF service, CINDA, RIPL, stopping powers, BetaShape, the medical portal.
4. **NEA**: "OECD Nuclear Energy Agency Data Bank, Paris". "Free, Java desktop and web". Button →
   https://www.oecd-nea.org/janisweb/. Its tools: JANIS, JEFF.
5. Candidates for a fifth, JAEA (JENDL) or KAERI, only if you can verify every row; else leave them out and say so.

## The groups and rows (every NSRgpt cell from the site itself; every other cell verified on the live site that day,
with the URL you checked in the cell's hover title; a cell you could not verify is "—" with title "not found on
<date>", never a guess)
1. **Data held** (15): NSR papers · ENSDF · XUNDL · EXFOR · ENDF/B (every release) · JEFF-3.3 · JENDL-5 ·
   TENDL-2023 · CENDL-3.2 · POINT files (reconstructed, broadened) · CINDA · ICRP 107 decay data · RIPL · IAEA
   stopping powers · BetaShape spectra. Values where a count fits (NSRgpt: 303,568 papers; 190,430 EXFOR datasets;
   13 libraries; 603,010 CINDA lines; from `/counts`), check marks otherwise.
2. **Search** (7): by nuclide · by reaction · by paper or author · one search across every source · search by
   meaning (a trained model) · CINDA index search · results from several sources in one list.
3. **View and plot** (12): cross section per reaction · several libraries on one plot · EXFOR points on the plot ·
   Doppler broadening on demand · resonance parameters · covariances · angular and energy distributions · decay
   radiations · decay chains · chart of nuclides · level schemes · fission yields.
4. **Analysis** (7): every measurement against every library, ranked · flagged EXFOR datasets · medical isotope
   production yields · a test of the ranking against the next release · ICRP 107 against ENSDF · a workbench with
   reproducible notebooks · integral benchmarks (NSRgpt: CoNDERC runs held; NEA: yes, the JANIS benchmark links;
   verify).
5. **Formats and access** (8): REST API · MCP · ENDF-6 download · GNDS 2.0 download · compile an uploaded file to
   GNDS · CSV and JSON export · bulk mirror or FTP · processing codes online (NJOY, PREPRO).
6. **Working with it** (6): chat that cites records · saved views and workspaces · accounts · open source ·
   desktop application · mobile layout.
The group row's "n of m" counts a check or a value as 1 and a dash as 0.

## Rules
Mac rules; `~/Code/nsrgpt` on main, shared; commit with explicit paths; push your own files only (never
`components/nsrcpt/`, `lib/home-data.ts`, `app/HomeMasthead.tsx`); types and lint on the box (http://18.216.193.38:3000
until 02:00 ET); both themes checked; the IAEA and NEA sites answer a browser user agent from the Mac even where the
boxes get a challenge, so verify from here. Files: `app/(site)/comparison/page.tsx`, `components/comparison/**`,
`lib/comparison.ts`, the header title, sidebar row and plate box.

## Done means
The page on the box with every row verified or marked, its heights and collapse matching the reference, in both
themes; one line to lead-agent with the URL and the count of cells marked "not found".

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/66-comparison-page.md and do it; one line to lead-agent when it is on the box.`
