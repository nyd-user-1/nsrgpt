# 41 — Morning report (2026-11-09, written 02:50 ET by lead-agent)

Everything is committed and pushed. Main at 76ec334; the type check is green on every commit through 8d732be and the
deploy to Cloudflare follows each push. Rollback point for the whole evening: tag `before-diagram-library` (1ec1a91).

- Production: https://nsrgpt.brendan-stanton.workers.dev
- Dev box: http://13.184.13.46:3000 (stops itself at 10:22 ET; `scripts/devbox/launch.sh start i-0ec4775a5cd68d41b`
  restarts it and prints the new address)

## What landed since the 2026-11-08 morning report (briefs 20 to 40)
1. **Raw layer:** the IAEA records repository indexed (6,810 records) and 5,666 of its files in the lake, DXS-2026
   included; PRONDOS. 4.97 GB of the 5.0 GB proxy cap used.
2. **Serving and API:** dataset routes for ENSDF, XUNDL, EXFOR, ENDF/B and NSR with text, Markdown and a rendered PDF;
   a store behind saves and uploads (DynamoDB and the lake, behind the Lambda with a write key); the structure index,
   EXFOR reactions and five diagram data files on the CDN.
3. **Graph:** the diagram library (19 reference figures drawn from parts and data: four decay series, s-, r- and
   rp-process, capture chains, transmutation flow, breeding, production routes, fission fan, level schemes and a
   ladder), Config that redraws shape, grid, bands, labels and arrows live, Export SVG, Share and Copy, dataset and
   material cards, the inset panels unified with drill-down menus, the sidebar's row and icon treatment throughout.
4. **Pages:** /pipeline on the canvas; /factory, /schema, /glossary, /data-dictionary; the five dataset indexes and
   records with Text, Markdown, PDF and Open in Graph; /viz/structure (the old chart with both colour codes and the
   Evaluation Index); /viz/chart with six colour modes; /viz/data/nuclides and /viz/data/reactions; the decay chart
   opening on the Pu-241 chain with a Σ line and a time marker.
5. **Shell:** one header for the app, the sidebar and the right panel; the search bar in the header on every page
   but the root; every page named in the header with click-to-copy; the sidebar's name a link home; the plate's boxes
   the same shape, pinned first, a Hidden section with unhide, menus with Favorite, Pin, Hide and Archive.
6. **Dev:** the EC2 dev box in place of the codespace, pulling main every 20 s, with a dev sign-in, Bedrock and Athena
   through its role so chat and typed search work there; the type-check hook allows remote runs.

## The lakehouse, phase by phase

| Layer | Now | What is left |
| --- | --- | --- |
| Raw | 99 | 448 records paperwork files over 6 MB, 46 records data files, 340 DXS-2018 extras, 615 IAEA proxy-budget files, phases 3 and 4 |
| Parsed | 90 | JEFF, JENDL, TENDL, CENDL as tables; ENDF sections beyond MF3 (fission yields, decay data, covariances); POINT above 293.6 K |
| Serving | 85 | per-nuclide counts for every mode are in; JEFF and friends once parsed |
| Catalog | 95 | new folders registered as they land |
| API | 90 | chat still reads Athena directly rather than the serving routes |
| Search | 70 | no JEFF or JENDL; keyword and meaning search live separately |
| UI | shipping | the open items below |

## Open items, in order
1. **Production saves:** set the Cloudflare secret `NSR_API_WRITE_KEY` (value in SSM `/nsrgpt/devbox/nsr-api-write-key`);
   until then production saves and uploads answer 503 and list the seeds.
2. **Brief 40, items 1 to 3:** a plate box for every sidebar page, icons in place of numbers, drag to reorder.
3. **Brief 39, part 2:** the four decay series on the Z by A grid (the second placeholder box); decay-chart polish
   (axis ticks at powers of ten, the marker handle, two overlapping labels).
4. **Brief 37, item 4:** element symbols on the chart of nuclides when zoomed in (the attempt blanked the cells and was
   backed out).
5. **Bugs noted:** nuclide card radiations over 100% for 137Cs (radiation files); /viz/heatmap's rainbow ramp;
   /api/graph labelling 60Co as "60Cobalt"; a stray workspace file in the Library.
6. **Parsing:** JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2 into the ENDF-shaped tables; MF8 and MF33.

## For the chat discussion
Bedrock Converse, default Sonnet 4.6 with a picker of 4.x models; NSR-CPT embeddings (277,068 papers) on every turn and
on /search, no toggle; tools nsr_sql (Athena), nsr_search, nsr_record; chat bypasses the serving API. Proposals are in
the 2026-11-09 00:00 reply: tools over the serving API, a sources rail with inline citations, answers only from
retrieved records, nightly checks against NNDC values, the model pinned to the current generation.
