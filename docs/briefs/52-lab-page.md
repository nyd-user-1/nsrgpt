# 52 — /lab: the workbench page, blocks that run (2026-11-09)

You're `window-3-cognito-pool`, now the Lab's page window. Written by `lead-agent` (Fable); Brendan approved the Lab
at 18:20 ET: a separate page, so /graph is untouched and the whole thing can be removed by deleting its folders.
Report to `lead-agent` by SendMessage only, one line per part; nothing goes to Brendan until the Lab lands. No
questions; decide and record. Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`). Peers:
`window-1-parser` builds the routes and the job runner (brief 51) and will message you their contracts;
`window-2-ui-layer` builds the test canvas on your blocks (brief 53) and needs your block contract first.

## Rules
1. `~/Code/nsrgpt` on main, shared: pull with `--rebase --autostash`, commit in one step with explicit paths, push
   right after. Type-check on the dev box through SSM before each push. You own `app/(site)/lab/**`,
   `components/lab/**`, `lib/lab/**`, `app/api/jobs/route.ts`, one row each in `components/sidebar/SideBarMenu.tsx`,
   `lib/header-titles.ts` and `lib/plate.ts`. Don't touch `components/nsr/graph/**`.
2. Reuse the primitives (EV rule 22): React Flow (`@xyflow/react` 12, as `components/nsr/graph/GraphPage.tsx` uses
   it), the inset panels (`components/nsr/graph/InsetPanel.tsx`, `LeftInsetPanel`, `RightInsetPanel`'s shapes),
   `ChatMarkdown` and `ChatInputContainer` (`components/chat/`), `SideBarMenuItem`, `KebabMenu`, the paper palette,
   `useData`/the API (`lib/data-url.ts`, `lib/community.ts` for the write-key proxy pattern), the dataviz skill's
   palette for series. Plain language; counts in short form; no captions that restate the layout.
3. Static shell: the page renders without data; blocks fetch when run.

## The page
Three columns in the app shell, like /graph: left inset rail (Blocks to add, Saved canvases), the canvas, right
inset panel (the selected block's settings and its output; the copilot). Beneath the canvas a bottom pane
(Datablocks' shape): the selected block's output as a table or text, Export (CSV, JSON), and a Logs tab with each
run's timing and status. Header name "Lab" (`lib/header-titles.ts`); sidebar row "Lab" with lucide `FlaskConical`
in the Main group; a plate box "Lab" with a one-line description.

## The block contract (write `lib/lab/blocks.ts` first, push it within the first hour, tell window-2-ui-layer)
```
type Port = "dataset" | "series" | "text"
type Block = { id: string; kind: BlockKind; title: string; params: Record<string, unknown>; position: {x,y};
               inputs: Record<string, Port>; outputs: Record<string, Port>;
               state: { status: "idle" | "running" | "done" | "failed"; startedAt?: string; ms?: number; error?: string } }
type Edge = { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }
type Canvas = { id: string; name: string; blocks: Block[]; edges: Edge[]; created_at; updated_at }
```
Values flow by port type: a `dataset` is `{ columns: string[]; rows: Record<string, unknown>[]; meta? }`, a
`series` is `{ name: string; x: number[]; y: number[]; lo?: number[]; hi?: number[]; unit_x; unit_y; meta? }` (or an
array of them), `text` is a string. Each kind declares its ports and a `run(params, inputs, ctx)` in
`lib/lab/kinds/<kind>.ts`; `ctx` gives `fetch` to the API and the job proxy, and `signal` to cancel.

## The five kinds
1. **Data:** a picker of sources with their own params: EXFOR points (`/exfor/points`, brief 51; fields target,
   reaction, quantity, emin, emax), ENDF cross section (`/endf/xs`; release, name, mt, emin, emax; `compare` for
   several releases, one series each), ENDF covariance (`/endf/cov`; release, name, mt), nuclide decays
   (`/nuclide/{name}`), a saved view's rows. Output: `dataset` and `series`. Shows row and point counts beneath.
2. **Process:** a job on the box: Broaden (release, name, mt, temperatures) through `POST /api/jobs` (your proxy to
   nsr-jobs, write key server-side as `app/api/community/route.ts` does), polling `GET /api/jobs/{id}` every 2 s,
   status on the block (queued, running with elapsed seconds, done, failed with the error). Output: one `series`
   per temperature. Reads a warm result at once when the runner says it exists.
3. **Compare:** inputs: a data `series` (or `dataset` of points) and one or more evaluation `series`; params:
   binning (log bins per decade, default 20), range (emin, emax), highlight range (e.g. 9e3 to 1.8e4), band from a
   covariance `dataset`. Output: `dataset` of bins (e_lo, e_hi, n_points, mean_ratio, sd, rel_sd_eval) and
   `series` of ratio per evaluation with `lo`/`hi` from the band. Pure client code.
4. **Plot:** ECharts through `components/viz/use-echart.ts`: log-log σ against E with points (per dataset, its
   author and year in the legend) and lines (per evaluation) with bands; a second mode, ratio against E with the
   highlight range shaded. Clicking a point opens its EXFOR subentry (`/datasets/exfor/<entry>`) in the right panel.
   Export SVG and PNG as /graph does.
5. **Prompt:** the prompt text with the inputs' summaries as context (a `dataset`'s columns and first rows, a
   `series`' name and range, `text` whole), sent to `/api/chat` with `systemContext`, answer streaming into the
   block through `ChatMarkdown` with the orb and citation chips; `ChatInputContainer` under it for follow-ups.
   Output: `text`.
Each block has a header (grip, title, kind icon, Run, kebab: Duplicate, Delete, Copy output), ports on left and
right, a body of its params, a foot with its status and output summary. Run on a block runs its upstream blocks
first when they are idle (topological). "Run all" in the canvas toolbar.

## Saving
Canvases save through `/api/community` with `kind: "lab"` (the store from brief 34; seeds untouched), listed in the
left rail under Saved, opened by `/lab?canvas=<id>`. `/lab` with no param opens the default canvas named in
`lib/lab/default.ts` (`window-2-ui-layer` fills it, brief 53; until then an empty canvas with a Data block).

## Done means
/lab live on the box with the five kinds running against real routes (Data and Compare and Plot and Prompt work
before the job runner lands; Process once it does); save and reopen work; sidebar row, header name and plate box in
place; type check green; the block contract pushed in the first hour; one final report to `lead-agent`.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/52-lab-page.md and do it; report to lead-agent after each part.`
