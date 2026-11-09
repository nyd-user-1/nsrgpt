# 33 — Dataset pages, open in Graph, exports, dev sign-in; and brief 32's unfinished port (2026-11-08, 23:45 ET)

Written by lead-agent for ui-layer-2. Report to `lead-agent` only; no questions; one report per part. Work in
`~/Code/nsrgpt` on main, pull before each commit, push each commit, CI type-checks every push. The box
(http://13.184.13.46:3000, pulls main every 20 s, stops about 04:40 ET) is where Brendan reviews. parsing-1 builds the
API routes and the store these pages call (brief 34); read it. Standing rules: plain language, paper palette, the
sidebar's row and icon treatment, static shells (brief 13), reuse before writing, no new dependencies without saying why.

## Part 0: brief 32 is ui-layer's
ui-layer is finishing brief 32 (the factory and schema canvases, the glossary, the data dictionary) in this same tree.
Don't touch `app/(site)/glossary/`, `app/(site)/factory/`, `app/(site)/schema/`, `app/(site)/data-dictionary/`,
`components/nsr/factory/`, `lib/glossary.ts` or `components/blocks.tsx`; pull before each commit so its work rides along.

## Part 1: the five dataset pages
The lake holds five parsed datasets (NSR, ENSDF, XUNDL, EXFOR, ENDF/B) and the app has a page for none of them; the
Datasets rows in /graph's rail point at `/ensdf/archive` and `/xundl`, which 404 (routes carried from the old app).
Build one page shape and use it five times, as NNDC's index pages do (Brendan's screenshots: an index by mass or nuclide,
then a dataset list with PDF and text buttons, then the record):
- `/datasets/{source}` the index: a filter by nuclide or mass (ENSDF, XUNDL), by target and reaction (EXFOR), by
  release and material (ENDF/B), by key or author (NSR); rows from the API's list routes (brief 34 B3, B4).
- `/datasets/{source}/{id}` the record: header, then the tables the record has (levels, gammas, other records; or the
  subentry's data columns; or the material's sections; or the reference's abstract and keywords), then the references
  with their NSR links, then the raw text in a mono block, collapsed by default.
- Three download buttons on every record, icon circles like /graph's: **Text** (the raw record as held, `.txt`),
  **Markdown** (`.md`, from the API's `/md` route), **PDF** (the page's print stylesheet, `window.print()`; the stylesheet
  hides the shell and prints the header, tables and references cleanly; say "Print to PDF" in the tooltip).
- A fourth button, **Open in Graph**: navigates to `/graph?center=dataset:<source>:<id>`. On /graph a new node type
  `dataset` (a card like a paper's, with the dataset's title, source and date; expanders "+ nuclide", "+ references",
  "+ levels" where the source has them) centres with its nuclide and references already linked, and the Papers view
  shows the record's header with the three download links. Use the record's `graph` block from the API.
- Fix the rail's Datasets rows to the five new routes, one row per source, A to Z.

## Part 2: exports and Graph Features
- **Export** button next to Share in /graph's bottom-right group, an icon circle: downloads the canvas as SVG, the
  diagram's title as the file name, the legend included. React Flow renders nodes as HTML, so serialize the visible
  viewport: use `lib/canvas-png.ts`'s element capture as the model and emit SVG through a `foreignObject` wrapper only if
  a native path is not possible; prefer drawing the diagram's parts natively (discs, squares, arrows, labels are simple
  shapes) from the spec and the laid-out positions, which gives a clean SVG for a paper. Say which path you took.
- Graph Features list: add two entries, "Build one for a nuclide" (type a nuclide, get its decay chain, capture chain or
  level scheme generated from the lake, not only the library's) and "Compare two diagrams side by side" (two canvases,
  same type, two nuclides, synchronised pan and zoom), each with one plain sentence and a "soon" mark. Brendan ranks
  them; don't build them yet.

## Part 3: dev sign-in
On the box, `/api/chat` answers 402 "Sign in to chat." because there is no session, so recipes run and get no model
output. Add a dev-only session: when `NEXT_PUBLIC_DEV_SIGNED_IN=1` is set (set it in `scripts/devbox/userdata.sh`'s
service environment and nowhere else), the app treats the reader as a signed-in dev user with a fixed id and name, chat
answers, saves carry that name. The flag does nothing in production builds; guard it so a missing or false value changes
nothing. Say in the report how you verified it can't leak into production.

## Done means
Part 1's five dataset indexes and records with the four buttons and the rail fixed, Part 2's Export
and the two Graph Features entries, Part 3's dev session, each checked on the box in both themes; CI green; reports.
