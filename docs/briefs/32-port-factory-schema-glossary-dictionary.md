# 32 — Port the factory canvas, the schema canvas and the glossary; build our data dictionary (2026-11-08, 23:00 ET)

Written by lead-agent for ui-layer. Report to `lead-agent` only; no questions; one report at the end. Work in
`~/Code/nsrgpt` on main, pull before each commit, push each commit, CI type-checks every push. The box
(http://13.184.13.46:3000, pulls main every 20 s, stops about 04:40 ET) is where Brendan reviews.

Brendan's standing rule (EV rule 14, memory "Port from the named source"): bring the named repo's full version of a piece,
not a trimmed copy, then adapt it to NSRgpt's design system. No hand-rolling. The current `/pipeline` page stays exactly
as it is; Brendan names the new pages' routes later, so use the working routes below and keep them easy to rename
(one entry each in `lib/header-titles.ts` and the sidebar).

## 1. The factory canvas → `/factory` (pax2's `/erd`, once `/pipeline-2`)
Source: `~/Code/pax-trinity/src/components/factory-canvas.tsx` (835 lines; pax2's copy is the same file) and its page
`~/Code/pax-trinity/src/app/erd/page.tsx` plus pax2's `~/Code/pax2/src/app/erd/page.tsx`. The whole factory on one
React Flow canvas: six node kinds (door, stage, store, instrument, service, surface), flow edges blue, loop edges purple
and numbered, planned edges dashed, live counts on the boxes, hover words on the chips, the gear opening the Architecture
panel (Factory and Widgets) that lights what you pick and dims the rest, drag with remembered positions and Reset layout.
Port it whole, then:
- content becomes NSRgpt's: doors are the sources (IAEA, NNDC, NEA, JAEA, the proxy lane, the Wayback lane); stages the
  raw, parsed and serving layers; stores the lake's prefixes and the Glue catalog; instruments the models and indexes we
  run (the NSR-CPT encoder, the keyword index, the chart data, the API); services Lambda nsr-api, CloudFront, Athena;
  surfaces Chat, Search, Graph, Charts, Pipeline. Counts from `lib/pipeline-map.ts` and the API where live; take the
  loops from how our data actually cycles (a parse feeds a serving table feeds the API feeds a page, saves feed Views).
  Keep every mechanic; replace every PAX2 word;
- the Architecture panel renders in our RightInsetPanel as a drill-down layer (brief 25's menu), not pax's shell slot;
- the paper palette and the sidebar's row treatment for the panel's entries; the canvas chrome as /graph's;
- no admin gate (ours has no session on the box); the page is a static shell per brief 13.

## 2. The schema canvas → `/schema` (pax-trinity's Schema tab)
Source: `~/Code/pax-trinity/src/app/data-dictionary/schema-canvas.tsx` (329 lines), which rides on factory-canvas.tsx's
node and edge dress. Port it whole, then the content is the lake's serving layer: one node per table in Glue database
`nsr` that the API reads (`nuclide_serve_*`, `endf_serve_*`, `exfor_serve_*`, `search_*`, the `endfb_*` and `ensdf_*`
parents), its columns under its name, and the keys between them (NUCID, MAT, entry number, NSR key number) as the edges.
Column lists from `services/nsr-api/README.md` and the serving manifests in `INVENTORY.md`; where a table's columns aren't
written down in the repo, read them from the lake's `manifest.json` for that folder. The gear opens Tables and Keys in
our right panel as a drill-down.

## 3. The glossary → `/glossary` (pax2's page)
Source: `~/Code/pax2/src/app/glossary/page.tsx` with `~/Code/pax2/src/lib/glossary.ts` and the `TableBlock` it uses from
pax2's `components/blocks`. Port the page and its table whole, then the terms are nuclear data's: start with the terms the
app already explains (ENSDF, XUNDL, NSR, EXFOR, ENDF, MF and MT, NUCID, DSID, MAT, Jπ, Q-value, half-life, branching
ratio, cross section, resonance, pointwise, evaluated against measured, the s, r and rp processes, decay modes α, β−, β+,
EC, IT, SF, the lake's layers raw, parsed, serving, Athena, Glue, the API), each with a plain one-sentence definition and
its group. A to Z by the term's full name as the source sorts it. Search stays.

## 4. Our own data dictionary → `/data-dictionary`
Not pax-trinity's. Build ours small, on the same TableBlock: one row per field the app shows or the API returns, with
Field, Type, Source dataset, Table, Description, and Where it appears (pages). Rows from `services/nsr-api/README.md`'s
route schemas and the serving tables' columns (the same reading as item 2). Group by dataset; search; sort by column.
If Brendan prefers, he will later ask for the glossary's shape instead, so keep the two pages' code parallel.

## Everywhere
Sidebar rows for the four pages in the Main group A to Z (Data dictionary, Factory, Glossary, Schema), header titles,
the sidebar's icon treatment, static shells, plain language, the paper palette. One report with commits, the four
routes, what was ported whole and what was adapted, and anything seen and not fixed.
