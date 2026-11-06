# Brief 07 — nsr-2: speed, the force graph, the 3D charts, Knowledge map 2

From lead-agent, 2026-11-05. Repo `/Users/brendanstanton/Code/nsrgpt`. Approved by Brendan.

## Tasks

1. **Speed.** Leaving the force graph (`/viz/graph`) for the next chart took ~5 s; leaving `/viz/isotope-radar` for `/viz/nuclide-card` took ~6 s. Find the cause by reading code first (likely suspects: synchronous dispose of a large ECharts force layout or three.js scene on unmount, re-parsing a large JSON on every mount, an exit animation that waits, layout still iterating). Fix it. Measure before/after with a headless trace only if code can't settle it. Hover on the force graph also lags — whatever you add must not make it worse.
2. **Force graph** (`/viz/graph`): a legend that shows/hides each decay-mode colour; open zoomed out so the whole graph fits; hovering a node highlights that node and its decay chain (its daughters onward and its parents back) and dims the rest — cheaply (precompute adjacency once; switch to a two-layer render if ECharts emphasis is too slow on 3,420 nodes / 4,783 edges).
3. **All 3D charts behave the same** (`scatter3d`, `scatter3d-dataset`, `surface`, `decay`, `decay2`, `knowledge`, `levels`): a slow rotation that stops on the first interaction, and scroll-to-zoom. Today the decay surface (`decay2`) is the only one that doesn't rotate and the only one that zooms.
4. **Knowledge map** (`/viz/knowledge`): a hover marker on the point under the pointer (grow it ~1.5× with an outline, via an instanced update, not a re-render) and the site's plus-and-crosshair cursor (the 2D charts have it through `components/viz/use-echart.ts`; give the three.js scenes the same look). Do the same cursor on `levels` and `decay`.
5. **Level energies** (`/viz/levels`): colour levels by parity (+ and −), lighter as energy rises; a small legend.
6. **Knowledge map 2** — a new chart at `/viz/knowledge-3d`: the knowledge map in 3D (x N, z Z, height = adopted level count or years since evaluation — pick the one that reads best, and say why), with a toggle that lays an N×Z grid of blocks (e.g. 10×10) over the floor; clicking a block selects the nuclides inside it and lists them (and their values) beside the scene. Reuse the existing knowledge data loader. Plain caption saying what the axes and colours are. Then tell me the `lib/viz-charts.ts` entry (`href`, `title` = chart type, `body` = variables, in the style of the existing entries) — I add it.

## Files you own

`app/(site)/viz/{graph,scatter3d,scatter3d-dataset,surface,decay2,knowledge,levels,knowledge-3d}/**`, `lib/viz-knowledge.ts`, `lib/viz-structure-tables.ts`, and for task 1 whatever it takes — but `components/viz/use-echart.ts` belongs to nsr-1 and `components/viz/FramedBox.tsx` / `VizShell.tsx` to me: send me (or nsr-1) the change instead of editing them. For `decay` (the first decay simulation): only the rotation/zoom/cursor parts of tasks 3–4 — I'm adding multi-select and marked moments to it, so coordinate by keeping your edit small and telling me which lines you touched.

Do NOT touch: `lib/viz-charts.ts`, `lib/header-titles.ts`, `components/SwitchboardPanel.tsx`, `app/(site)/viz/{reactions,nuclide-card,isotope-radar}/**`, nsr-1's 2D charts.

## How

- Worktree: reuse `../nsrgpt-perf`: `git fetch origin && git checkout -B speed-3d origin/main`.
- No local builds, dev servers, typechecks or lint (hook). esbuild syntax check from `/Users/brendanstanton/Code/NYSgpt`. Headless only when code can't confirm.
- Commit per task, Brendan's style, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push `speed-3d` as you go; SendMessage `lead-agent` after task 1 (cause + fix) and when 2–6 are pushed.
- Visible text: plain literal words, first person singular, no metaphors.
