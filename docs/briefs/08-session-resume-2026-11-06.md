# 08 — Resume NSRgpt (2026-11-06, after reboot)

You're the lead on NSRgpt. Read this, then wait for Brendan's first instruction.

## Where things stand
- Repo `~/Code/nsrgpt` (nyd-user-1/nsrgpt). `main` is clean and live at https://nsrgpt.brendan-stanton.workers.dev (commit 13ee3be). A push to `main` deploys through GitHub Actions (OpenNext on Cloudflare).
- Shipped today:
  - particle view `/viz/particles` (threejs-particle-fluids, WebGPU, measured decay heat)
  - force graph flow, pins and 3D
  - IAEA Live Chart API charts: `/viz/fission-yields`, `/viz/explorer`, `/viz/radiation`, `/viz/gamma-lines`
  - `MenuSelect` in place of every native `<select>`
  - chart controls and legends moved to the right panel (Viz › chart, `components/viz/VizControls.tsx`, `EChartLegend.tsx`)
  - ShiftNote ported from pax-trinity's `floating-note.tsx`
- IAEA data: raw and site files in `s3://nsr-lake-613473203863/raw/iaea-livechart/2026-11-06/` (profile `nysgpt-new`; Athena database `nsr`, views `iaea_*`). Scripts: `scripts/iaea-livechart-pull.mjs` and `scripts/iaea-livechart-build.mjs`. Sketch: `docs/sketches/2026-11-06-livechart-api.html`.

## Open items (Brendan to rule)
1. General organisation: merging the original nsr repo, and moving all of `public/viz-data` to S3.
2. Two charts still share their width with a detail chart: matrix (380 px pair scatter) and spectra (340 px).
3. 3D force graph: nodes outside a pinned chain don't fade enough.
4. "Add to blocks" as saved chart views (a chart plus its selection and camera).

## Rules (his, standing)
- Efficient Voice: y/n first, then 10–20 words, never over 50. Numbered items, each restating the subject in bold starting with "…", answer on the next line. No italics, no chevrons. Bottom line, not diffs. Facts only: no editorial and no opinion unless he asks for it. Direct questions get direct answers (10 words or less if enough); yes/no gets yes or no. Full rule: docs/sketches/2026-11-06-efficiency-voice.html.
- Small change, small effort: edit and report. No codespace, test harness or push unless asked.
- When he says he wants to see it built or live, push one batch, watch the deploy and curl the pages.
- Port, don't hand-roll: when he points at existing code (pax-trinity etc.), copy it exactly.
- No browser dropdowns. Charts fill the whole container; controls and legends go in the right panel.
- Do only what's asked. No subagents. Local builds and dev servers only when he directs, with the prefix `BRENDAN_OK_LOCAL_BUILD=1`.
- Plain language, first person singular in UI copy. Never raise LegiScan.
- Typecheck, if needed: codespace `nsrgpt-dev-jjg4wr96jqg9cqx7x`. Ship code in with `git bundle` and `gh codespace cp`, then run `pnpm exec next typegen && pnpm exec tsc` and `next lint --quiet` (corepack pnpm@11.1.1).
