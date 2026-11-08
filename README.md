# NSRgpt

Find, read, connect and work with nuclear data. In seconds.

For nuclear data evaluators (NNDC and the US Nuclear Data Program) and nuclear physicists: chat, search, a paper graph and 32 charts over the Nuclear Science References (NSR) and the NNDC and IAEA databases (ENSDF, XUNDL, EXFOR, AME2020, NUBASE2020, CapGam, JEFF-3.1.1 fission yields). Where it is going: one assistant across the five core datasets, NSR, ENSDF, XUNDL, EXFOR and ENDF/B, with every answer traced to its record, dataset or data point.

Live: https://nsrgpt.brendan-stanton.workers.dev

## Stack

| Part | What |
| --- | --- |
| App | Next.js 15 (App Router), React 19, Tailwind v4 |
| Charts | ECharts 5 and echarts-gl; three.js through @react-three/fiber and drei |
| Particle physics | threejs-particle-fluids (WebGPU) |
| Notes | TipTap 3, ported from pax-trinity |
| Hosting | Cloudflare Worker `nsrgpt`, built with OpenNext |
| Data | Static JSON in the lake (`site/viz-data/<version>/`) behind CloudFront, built from snapshots (`lib/data-url.ts`, `scripts/viz-data-publish.sh`); raw pulls in S3 |
| Chat and sign-in | Bedrock (the models pax-trinity serves); Cognito (invite-only pool) |
| Search | Lambda `nsr-search`: the NSR-CPT encoder and paper vectors |

## Pages

| Page | What |
| --- | --- |
| `/` | Masthead and the 32 chart boxes, A to Z, 8 per frame |
| `/chat` | Chat over NSR with tools that query the lake through Athena (`lib/chat-data/tools.ts`: `nsr`, `ensdf_datasets`, `xundl_datasets`, `exfor_entries`, `endf_reports` and the link tables); a Sources list of matching papers under each answer; a warm countdown for the search Lambda |
| `/search` | Hybrid, meaning and keyword search over NSR, result charts, a record drawer and a chat per record |
| `/graph` | Paper graph: nodes expand from Athena (2–5 s), similar papers from Lambda |
| `/docs` | Help center |
| `/pipeline` | The sources (each org's datasets, formats, codes and frameworks, held or to get), the lake with the five core datasets and the keys that join them, and what reads the lake, built and planned; pax2's production map, ported (`components/pipeline/`, data in `lib/pipeline-map.ts`) |
| `/viz/…` | The charts (below) |
| `/signin`, `/signup`, `/invite` | Cognito, invite-only; `/chat`, `/search` and `/graph` need sign-in |
| `/account`, `/profile`, `/settings`, `/notifications` | Account pages |

## Deploy

A push to `main` deploys: `.github/workflows/cloudflare.yml` builds with OpenNext and deploys the worker; `.github/workflows` also runs the typecheck. Each build writes `/build-usage.json` with its commit, so the live commit can be checked:

```bash
curl -s https://nsrgpt.brendan-stanton.workers.dev/build-usage.json
```

Batch changes into one push: every push is a build.

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm exec next typegen && pnpm exec tsc
pnpm exec next lint --quiet
```

The package manager is pnpm 11.1.1 (`corepack pnpm@11.1.1` where pnpm isn't installed).

## Charts

Every chart is a page under `/viz/`, listed in `lib/viz-charts.ts` (the order the index, the header switcher and ‹ › follow) and named in `lib/header-titles.ts`. Each chart fills the main container; its controls and legend live in the right panel under Viz › the chart (`components/viz/VizControls.tsx`, `components/viz/EChartLegend.tsx`).

| Page | Chart |
| --- | --- |
| `/viz/nebula` | Scatter field: A against binding energy per nucleon |
| `/viz/rainfall` | Stacked area: nuclides per A by decay mode |
| `/viz/bar-large` | Bar run: half-lives, longest first |
| `/viz/weight` | Two-series scatter: E(2⁺) and B(E2) |
| `/viz/heatmap` | Heatmap: half-lives on N–Z |
| `/viz/scatter3d` | 3D scatter: E(2⁺), B(E2), Z |
| `/viz/scatter3d-dataset` | 3D scatter: 50,000 EXFOR measurements |
| `/viz/simplex` | Line strips: capture γ lines |
| `/viz/surface` | 3D surface: binding energy |
| `/viz/graph` | Force graph: the decay network, with flow, pinned chains and a 3D layout |
| `/viz/reactions` | Flow lines: decay routes on the chart of nuclides |
| `/viz/matrix` | Correlation matrix: nine nuclide measures |
| `/viz/decay` | Decay simulation: every ground state decaying at its rate |
| `/viz/decay2` | Decay simulation 2: the population as a surface |
| `/viz/explorer` | 3D explorer: any ground-state property on any axis |
| `/viz/fission-yields` | Fission yields: mass curves for eight parents, N–Z in 3D |
| `/viz/radiation` | Decay radiation: every line one nuclide's decay emits |
| `/viz/gamma-lines` | γ-line finder: emitters near a peak energy |
| `/viz/particles` | Particles: one gram's decay heat driving smoke through air (WebGPU) |
| `/viz/decay-chain` | Decay chain: Bateman solution for one gram |
| `/viz/knowledge` | Knowledge map: ENSDF evaluation age and coverage |
| `/viz/spectra` | Spectra: capture γ spectra |
| `/viz/gamma-atlas` | Heatmap: capture γ intensity by energy and A |
| `/viz/gamma-punchcard` | Punch card: capture γ intensity by element |
| `/viz/levels` | Level energies: 139,868 adopted levels in 3D |
| `/viz/first-excited` | Aggregate bar: E(2⁺) by element |
| `/viz/level-spans` | OHLC bars: level spans along an isotope chain |
| `/viz/level-candles` | Candlestick: level energies by A |
| `/viz/separation` | Candlestick: neutron separation energies |
| `/viz/nuclide-card` | Radar: one nuclide's six measures, with an overlay |
| `/viz/isotope-radar` | Radar timeline: every isotope of an element |
| `/viz/literature` | Scatter field: papers per nuclide |

## Data

The lake is `s3://nsr-lake-613473203863` (New account, AWS profile `nysgpt-new`, us-east-2). `INVENTORY.md` at its root lists every folder; `docs/sketches/2026-11-07-data-index.html` counts every dataset. After the night of 2026-11-07: 277.1 GB, 73,926 files. The core five below hold about 35 million records (counted 2026-11-07); the libraries added that night aren't counted yet. Athena reads the database through the Glue database `nsr` and the workgroup `nsrgpt`: the 42 tables, the view `nsr`, and the IAEA views `iaea_*`. The live site never calls an outside data source at request time.

| Dataset | Record | Count | Inside | In the lake | In the app |
| --- | --- | --- | --- | --- | --- |
| NSR | reference | 303,568 (255,315 NSR, 48,253 arXiv/APS) | 3.7 million links to authors, nuclides, reactions, subjects, topics | `lake/nsr-database/2026-10-15/`; NNDC's monthly exports to 2026-08 in `raw/nndc/2026-11-07/nsrarchivals/`; 37,417 paper PDFs in `files/pdfs/arxiv/` | chat, search, graph |
| ENSDF | dataset | 20,117 (release 2026-11-05) | 568,228 levels, 793,431 gammas | every release, 2004 to 2026-11-05, in `raw/nndc/2026-11-07/ensdfarchivals/`; the database table is from 2026-10-15 | chat, charts |
| XUNDL | dataset | 12,547 (release 2026-10-01) | 194,604 levels, 257,154 gammas | `raw/nndc/2026-11-07/xundlarchivals/` and `ensdfarchivals/` | chat |
| EXFOR | entry | 27,116 (223,615 subentries) | 19.4 million measured data rows | `raw/github/IAEA-NDS/EXFOR-JSON-File/` | entry descriptions only (27,070, no values); one chart samples 50,000 points |
| ENDF/B | material | 22,315 in B-II to B-VIII.1 (5,135 in B-VIII.1) | 9.1 million cross-section points | `raw/nndc/2026-11-07/endf-releases/`, `endf-library/` (with ACE, POINT, GNDS, EPICS) | not connected; the app holds only 316 ENDF report records |

Also in the lake: the IAEA Live Chart pull (360,475 rows, `raw/iaea-livechart/2026-11-06/`, used by the charts); NNDC's CapGam (287 datasets), B(E2), Wallet Cards, NuDat chart data, double-beta decay, MACS, low-fidelity covariances, ENDF reports, USNDP reports and work plans, and meeting documents (`raw/nndc/2026-11-07/`, `manifest.json` lists every file); RIPL-3, RIPL-4, PD2019 plots and the ENDFtk, endf-parserpy, exforparser and ndlab sources (`raw/github/`); NSR-CPT training files and models (`work/embed-v2/`).

Added the night of 2026-11-07 (brief 11, `docs/sketches/2026-11-07-iaea-inventory.html` lists every item, taken or not and why):
- `raw/iaea/2026-11-07/` (70 GB): IAEA's ENDF archive (JEFF-4.0, JEFF-3.3, JENDL-5, CENDL-3.2, ROSFOND-2010, BROND-3.1, FENDL-3.2/b/c, IRDFF-II, IAEA-PD-2019 and the other libraries), the IAEA subsites and Quick Links databases, and 50 CD-ROM packages, among them X4Pro (all of EXFOR as one SQLite database), EXFOR C5 and x5json, EMPIRE, IBANDL, GRUCON and TALYS.
- `raw/openmc/2026-11-07/` (47.5 GB): the OpenMC data libraries and depletion chains.
- `raw/nndc-sigma/2026-11-07/` (2.7 GB): JEFF-3.1, JENDL-4.0, JENDL-3.3, ROSFOND and CENDL-3.1, per material, from NNDC's Sigma.
- `raw/jaea/2026-11-07/`, `raw/nea/2026-11-07/`: JENDL and JEFF originals from Internet Archive copies.
- `raw/github/` (58 repositories): EXFOR in X4, C4, CX4 and J4, NJOY2016/21, PREPRO, ACEMAKER, GANDR, OpenMC, fudge, endf-python and more; PyPI source packages.

Not held: ENDF/B-I (NNDC has no copy); 11,289 IAEA addresses (about 7.4 GB, mostly TALYS, ADS, DXS and EPICS files) left for a proxy window (`raw/iaea/2026-11-07/_work/pending-proxy-window.json`); about 59 GB still arriving from Internet Archive copies (TENDL-2023/2021, JENDL special files, JEFF-3.3 charged-particle files; `_work/wayback-lane-remaining.json`).

Chart snapshots:

| File or folder | Source | Built by |
| --- | --- | --- |
| `public/viz-data/decay.json` | ENSDF ground-state decays | `scripts/viz-decay-snapshot.mjs` |
| `public/viz-data/masses.json` | AME2020 | `scripts/viz-masses-snapshot.mjs` |
| `public/viz-data/levels.json` | ENSDF adopted levels | `scripts/viz-levels-snapshot.mjs` |
| `public/viz-data/capgam.json` | NNDC CapGam | `scripts/viz-capgam-snapshot.mjs` |
| `public/viz-data/exfor.json` | EXFOR (IAEA-NDS/exfor_json) | `scripts/viz-exfor-snapshot.mjs` |
| `public/viz-data/knowledge.json` | ENSDF and NSR | `scripts/viz-knowledge-snapshot.mjs` |
| `public/viz-data/graph-layout*.json` | Force graph layouts, 2D and 3D | `scripts/viz-graph-layout.mjs`, `scripts/viz-graph-layout-3d.mjs` |
| `public/viz-data/fission/`, `livechart-ground.json`, `decay-energy.json`, `radiation/`, `gamma/` | IAEA Live Chart API | `scripts/iaea-livechart-pull.mjs`, then `scripts/iaea-livechart-build.mjs` |

## Services

Lambda functions in the New account, us-east-2.

| Function | Code | What |
| --- | --- | --- |
| `nsr-search` | `services/nsr-search/` | NSR-CPT meaning, hybrid and keyword search over the paper vectors in `work/search/v1/`; about 22 s to wake, 0.25–0.5 s warm; `/chat` sends a wake-up ping when it loads (`/api/warm`) |
| `nsr-fetch` | `services/nsr-fetch/` | Copies web files straight into the lake (writes under `raw/` only); pulled all of NNDC on 2026-11-07 |
| `nsr-count` | `services/nsr-count/` | Read-only; counts the records inside lake files (ENSDF, XUNDL, EXFOR, ENDF) |
| `iaea-pull` | `services/iaea-pull/` | Probes, crawls, reads the Internet Archive's index, selects files and drives `nsr-fetch` in chained pulls, from inside AWS (brief 11) |

## Scripts

| Script | What |
| --- | --- |
| `scripts/nndc/crawl.py`, `list.py`, `pull.py` | The 2026-11-07 pull of www.nndc.bnl.gov into `raw/nndc/2026-11-07/` |
| `scripts/nsr-fetch-ui/server.mjs` | `http://localhost:4317`: paste web addresses, put them in the lake, see a card per file (`docs/sketches/2026-11-07-nsr-fetch.html`) |
| `scripts/iaea/` | Brief 11's tools: `box/mirror.py` (real Chrome through a proxy line, on an EC2 box, for sites behind a bot check), `box/wbget.py` (Internet Archive copies straight to S3), `manifest.sh`, `inventory.sh` (rebuilds the IAEA inventory sketch from the manifests) |
| `scripts/proxy/proxies.sh` | The Webshare proxy lines from SSM `/nsrgpt/webshare/proxies`; the $6 monthly plan is paid through 2026-11-19 |
| `scripts/viz-*.mjs`, `scripts/iaea-livechart-*.mjs` | Chart snapshots and the IAEA Live Chart pull |

## Open items

- Saved chats aren't kept: their store, the DynamoDB table `nysgpt-ledger`, doesn't exist yet. The sidebar shows 10 seeded chats.
- ENDF/B libraries and EXFOR's measured data are in the lake but not connected to the app.
- No writable store yet for `/graph` uploads, saved views and recipes, or saving an abstract on `/search`.

## Layout

| Path | What |
| --- | --- |
| `app/(site)/` | The app inside AppLayout; `(plate)` is the index, `viz/` the charts |
| `app/api/` | Chat, notes, Cloudflare usage |
| `components/` | AppLayout, the switchboard (right panel), ShiftNotes, shared chart parts in `viz/` |
| `lib/` | Data loaders and physics: `viz-physics.ts`, `viz-bateman.ts`, `viz-decay-heat.ts`, `viz-3d*.ts` |
| `scripts/` | Snapshot, layout and IAEA scripts; `nndc/` the NNDC pull; `proxy/`; `nsr-fetch-ui/` |
| `services/` | The Lambda functions: `nsr-search`, `nsr-fetch`, `nsr-count` |
| `docs/briefs/` | Session briefs; `docs/sketches/` the HTML sketches (`2026-11-07-data-index.html` the data index, `2026-11-07-nndc-inventory.html` the NNDC pull, `2026-11-07-iaea-inventory.html` the IAEA and open-library pull, `2026-11-06-efficiency-voice.html` the EV rules) |
