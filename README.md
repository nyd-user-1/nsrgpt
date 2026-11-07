# NSRgpt

Charts, tables and chat over nuclear structure and decay data: the Nuclear Science References (NSR) corpus and the NNDC and IAEA databases (ENSDF, XUNDL, EXFOR, AME2020, NUBASE2020, CapGam, JEFF-3.1.1 fission yields).

Live: https://nsrgpt.brendan-stanton.workers.dev

## Stack

| Part | What |
| --- | --- |
| App | Next.js 15 (App Router), React 19, Tailwind v4 |
| Charts | ECharts 5 and echarts-gl; three.js through @react-three/fiber and drei |
| Particle physics | threejs-particle-fluids (WebGPU) |
| Notes | TipTap 3, ported from pax-trinity |
| Hosting | Cloudflare Worker `nsrgpt`, built with OpenNext |
| Data | Static JSON in `public/viz-data/`, built from snapshots; raw pulls in S3 |
| Chat and sign-in | Bedrock; Cognito (invite-only pool) |

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

All NSRgpt data is in `s3://nsr-lake-613473203863` (AWS profile `nysgpt-new`, us-east-2); `INVENTORY.md` at its root lists every folder. The nsr database export (42 tables) is in `lake/nsr-database/2026-10-15/`, the raw IAEA Live Chart pull with its built files and `manifest.json` in `raw/iaea-livechart/2026-11-06/`, paper PDFs in `files/pdfs/`, and NSR-CPT training files in `work/embed-v2/`. Athena reads it through the Glue database `nsr` and the workgroup `nsrgpt`: the 42 tables, the view `nsr`, and the IAEA views `iaea_*`. The live site never calls an outside data source at request time.

## Layout

| Path | What |
| --- | --- |
| `app/(site)/` | The app inside AppLayout; `(plate)` is the index, `viz/` the charts |
| `app/api/` | Chat, notes, Cloudflare usage |
| `components/` | AppLayout, the switchboard (right panel), ShiftNotes, shared chart parts in `viz/` |
| `lib/` | Data loaders and physics: `viz-physics.ts`, `viz-bateman.ts`, `viz-decay-heat.ts`, `viz-3d*.ts` |
| `scripts/` | Snapshot, layout and IAEA pull and build scripts |
| `docs/briefs/` | Session briefs; `docs/sketches/` the HTML sketches |
