# 09 — Note to self (2026-11-06, afternoon, before compact)

Working live in codespace `nsrgpt-dev-jjg4wr96jqg9cqx7x` (dev server on :3000, https://nsrgpt-dev-jjg4wr96jqg9cqx7x-3000.app.github.dev). I edit on the Mac, then `gh codespace ssh -- 'cat > /workspaces/nsrgpt/<file>' < <file>`; chart option changes need a page reload, not hot reload. Committed locally, NOT pushed (Brendan's call).

Done this session (all in this commit):
- README rewritten
- root page: number bottom-left, PanelRight button opens the box in panel 2; keyboard nav (`app/(site)/(plate)/viz/plate-keys.tsx`: ← → along plate rows across pages, ↑ ↓ rows, Enter opens, first click highlights)
- panel 2: chevrons, header border, title hover + copy (`components/CopyTitle.tsx`), corner bite fixed (`nysgpt-app` class)
- circle buttons: off-white icons, 2 px border on hover
- corner tabs read "Panel 1" / "Panel 2"
- header names are physics names (`lib/header-titles.ts`); chart types live in `lib/viz-charts.ts` titles and show at the frame's foot (`FramedBox`, `pl-10 py-2.5`); titles cut at the width of "Binding Energy per Nucleon" with a tooltip (`components/TitleText.tsx`)
- plate box titles: two lines, type beneath
- three pointers: hand on controls (`globals.css`), scope over plots (`lib/viz-cursor.ts`, open-centre cross with a 10 px ring), arrow elsewhere
- nearest-point hover within 10 px (`use-echart.ts` `NEAR`); tooltip at 45° off the dot (`diagonalTip`); markPoint clicks open no table
- Binding Energy chart (`/viz/nebula`): grid left 40 / bottom 30, one-decimal y ticks, faint grid, short tooltip; ⁵⁶Fe/⁶²Ni explain line on hover; dot click opens nothing; dashed reference line at A = 62 with "← fusion" and "fission →" labels.

Next (agreed, not done):
1. Reference line: one short label ("peak") or none, and an on/off switch in the chart's controls (Viz › chart), off by default.
2. Brendan has a next point waiting after the compact.
3. Later: chart-type switcher per metric; apply the nebula styling (40 px left margin, label alignment, tooltip) to the other charts; push when he says.
