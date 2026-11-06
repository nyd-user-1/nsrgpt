# Brief 06 — nsr-1: hover and selection on the 2D charts, table row selection

From lead-agent, 2026-11-05. Repo `/Users/brendanstanton/Code/nsrgpt`. Approved by Brendan.

## The rule

A reader must always see which datum is under the pointer or selected. One rule per mark type:

- **Dots** (scatter field, two-series scatter, literature field, line strips, spectra): the hovered dot grows (~1.6×) and gets a 1.5px ink outline. On big series (ECharts `large`/progressive, thousands of points) do NOT use per-point emphasis — add one extra single-point "highlight" series and move it to the hovered datum on `mouseover`/`updateAxisPointer`. Hover must not get slower; the force graph already lags and Brendan watches for it.
- **Bars and candles** (bar run, aggregate bar, OHLC bars, both candlesticks): a muted full-height band behind the hovered bar (axisPointer `shadow` in `var(--paper-quiet)`-like colour). Don't recolour the bar or candle.
- **Heatmap cells** (heatmap, gamma atlas, punch card, correlation matrix): the hovered cell gets an ink outline and is drawn above its neighbours.

## Tasks

1. Apply the rule to: `/viz/nebula`, `/viz/bar-large`, `/viz/weight`, `/viz/heatmap`, `/viz/simplex`, `/viz/spectra`, `/viz/gamma-atlas`, `/viz/gamma-punchcard`, `/viz/first-excited`, `/viz/level-spans`, `/viz/level-candles`, `/viz/separation`, `/viz/matrix`, `/viz/literature`.
2. **Two-series scatter** (`/viz/weight`): the two colours are nearly indistinguishable — pick a high-contrast pair that works in light and dark.
3. **Line strips and spectra**: open zoomed to a range, not the full scope; add a pan/zoom slider (dataZoom). Keep the existing scale controls on spectra working.
4. **Correlation matrix**: visible 1px cell borders that stay on hover (today the outline disappears on hover — the opposite of what we want); a click on a cell opens a scatter of those two measures (a small view in the same frame is fine, or the second panel if that's simpler).
5. **OHLC bars** (`/viz/level-spans`): clearer axis labels and a short plain caption on how to read it.
6. **Table row selection → chart**: in `components/viz/DataTable.tsx`, rows are selectable (click, Shift-click for a range, Cmd/Ctrl-click to add). Selected rows show the same muted band on the matching candles (both candlesticks) and the hover outline/marker on the matching points elsewhere. Reuse the existing row→datum pointer mechanism (a table row already lands the crosshair on its datum).

## Files you own

The chart files for the 14 routes above (`app/(site)/viz/<route>/**`), `components/viz/use-echart.ts`, `components/viz/DataTable.tsx`, and the matching `lib/viz-*.ts` loaders if needed.

Do NOT touch: `components/viz/FramedBox.tsx`, `components/viz/VizShell.tsx`, `lib/viz-charts.ts`, `lib/header-titles.ts` (lead-agent: keyboard stepping, new chart entries); `app/(site)/viz/{graph,reactions,decay,decay2,knowledge,levels,nuclide-card,isotope-radar,scatter3d,scatter3d-dataset,surface}/**` (others); `components/SwitchboardPanel.tsx`.

## How

- Worktree: `cd /Users/brendanstanton/Code/nsrgpt && git worktree add ../nsrgpt-2d -b charts-2d origin/main`.
- No local builds, dev servers, typechecks or lint (hook). Syntax: `node_modules/.bin/esbuild <file> --loader:.tsx=tsx > /dev/null` from `/Users/brendanstanton/Code/NYSgpt`. Headless browser only when code can't confirm something.
- Commit per chart or small group, Brendan's style (what and why, dated), ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push `charts-2d` as you go; SendMessage `lead-agent` when tasks 1–6 are pushed (a one-paragraph summary; list anything you couldn't do).
- Any visible text: plain literal words, first person singular, no metaphors.
