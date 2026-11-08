# 21 — Fix the page-transition regression; put the pipeline on the graph canvas (2026-11-08)

Written by lead-agent (Fable) for ui-layer. Report to `lead-agent` only. Efficiency Voice in every report.

## Where to work
- Branch `ui-layer`, Mac worktree `~/Code/nsrgpt-ui-layer` (already checked out there; the lead has stopped touching
  it). Not main. Don't create another worktree.
- Brendan watches the codespace dev server: https://nsrgpt-dev-jjg4wr96jqg9cqx7x-3000.app.github.dev. Ship every
  commit there as a patch, since the codespace has no git credentials:
  `git format-patch -1 --stdout HEAD | BRENDAN_OK_LOCAL_BUILD=1 gh codespace ssh -c nsrgpt-dev-jjg4wr96jqg9cqx7x -- 'cd /workspaces/ui-layer && git am -q'`.
  The dev server hot-reloads. If it dies: `pkill -f "[n]ext dev"` (the brackets keep pkill off the ssh command), then
  `(setsid nohup bash -c "NEXT_PUBLIC_DATA_BASE=https://dcl3kyt3ynmb2.cloudfront.net BRENDAN_OK_LOCAL_BUILD=1 pnpm dev -p 3000" > /home/node/ui-layer-dev.log 2>&1 < /dev/null &)`.
  `BRENDAN_OK_LOCAL_BUILD=1` is allowed on the codespace only. No builds, type checks or dev servers on the Mac
  (8 GB Air); run the type check on the codespace.
- Push `ui-layer` after each commit. Commit messages: plain language, dated, with the attribution lines this session
  uses (see `git log -1 eae251b`).

## Task 1 — the page transition covers the shell's border
Symptom (Brendan's screenshot, 14:52 ET, dark theme, navigating to `/viz/data/bar-large`): during and after the
transition, the content region below the header renders as an opaque black rectangle with no border and no radius.
The shell's rounded, bordered panel shows only around the header strip. It used to work; it broke some time in the
last two days.

Where the chrome lives: `app/(site)/layout.tsx` → `components/AppLayout.tsx` (`paperMode`); every page arrives through
`app/(site)/template.tsx` → `components/RevealFx` (`translateY={4}`, `className="flex min-h-0 min-w-0 flex-1 flex-col"`).
Commits since 2026-11-06 that touched this path, newest first: b055bde (React Flow control variables in
`app/globals.css`), 7fc17bf, b143364 (RightRail, `<html data-rail-right>`), 6022996 (Step 5: no server data calls while
a page renders), e69888c (Step 4: shared data hook), e36acc9 (Step 2: static shells; touched `app/(site)/layout.tsx`,
`components/viz/VizShell.tsx`, `components/ui/chart-skeleton.tsx`), 00da7a1 (/chat, /search, /graph ported), 3e05c5f
(SideBarMenu, /docs), 515b598, e40c219, 1719052 (RevealFx template).

Do: reproduce on the codespace (Search → a Data table → a Chart, dark and light). Find the element painting the black
region (a loading shell, skeleton, or a background on the RevealFx wrapper or a page root that now fills the panel
and sits above its border). Check each commit above against the shell: `git diff 1719052 HEAD -- components/AppLayout.tsx
components/RevealFx.tsx components/viz/VizShell.tsx components/ui/chart-skeleton.tsx app/globals.css`. Fix it at the
cause, not with an overlay rule. Done means: the panel's border and radius stay visible for the whole transition on
every page group (chat, charts, data tables, docs, graph, pipeline, search), both themes. Say which commit broke it.

## Task 2 — the pipeline on the graph canvas, in our palette
Brendan (14:55 ET): the port brought pax2's "block" with it. Take the pipeline out of the block and drop it onto the
infinite canvas `/graph` uses, in our colours.

Current: `app/(site)/pipeline/page.tsx` wraps `components/pipeline/production-map.tsx` and `pipeline-flow.tsx` in
`DiagramBlock` (`components/blocks`): a second "Pipeline" title bar with an Ask button, a Docs footer, pax2 classes
(`bg-pax2-lavender`, `text-pax2-light-blue`, `bg-pax2-red-soft`, slate greys, white cards). Content comes from
`lib/pipeline-map.ts` (`SOURCES`, `LAKE`, `CORE`, `NUCLIDE`, `SURFACES`, `Status`).

Do:
1. The page is the canvas, filling the shell's content area the way `/graph` does: React Flow (`@xyflow/react`) with the
   same chrome as `components/nsr/graph/GraphPage.tsx` (background, controls in the paper palette through
   `app/globals.css`'s `html .react-flow` variables, `fitView({ padding: 0.12, maxZoom: 1 })`, pan and zoom). No
   `DiagramBlock`, no inner title bar, no Ask button, no Docs footer. The header title stays "Pipeline"
   (`lib/header-titles.ts`).
2. Three columns as nodes at fixed positions: sources left (one node per org, its items inside, collapsed by default
   with the chevron), the lake in the middle (bucket, size, files, the five core datasets, the shared keys), the
   surfaces right (one node each). Edges from source to lake and lake to surface, the path labels in mono muted text;
   planned items and their edges dashed, as now.
3. Our palette only: cards `var(--paper)` with `var(--paper-rule)` borders, text `var(--paper-text)`, muted
   `var(--paper-muted)`, the accent the app already uses for live state (`text-nuclear` and its tokens; see the
   design system page and `GraphPage.tsx`'s `EntityNode` for the card style). Status chips: Held and Live filled with
   the accent, Partly outlined, Planned dashed. `grep -rn pax2 app/\(site\)/pipeline components/pipeline` returns
   nothing when you are done. Both themes.
4. Refresh the numbers from `docs/briefs/19-morning-report.md` and the lake's `INVENTORY.md`: 430.7 GB, 117,824 files;
   core counts NSR 303,568, ENSDF 20,117 datasets, XUNDL 12,547, EXFOR 27,116 entries, ENDF/B 22,315 materials.
   Surfaces: Chat, Search, Graph, Charts Live; ENDF/B and EXFOR "API live, page planned"; the rest Planned.
5. Reuse before writing: the node card, handles and edge styles from `GraphPage.tsx`; the pipeline content from
   `lib/pipeline-map.ts`. Delete what the block needed and nothing else uses (check with grep before deleting).

## Rules (Brendan's, standing)
1. Plain language in labels and headings; no captions that restate the layout; first person singular where a voice is
   needed; no pax2 or NYSgpt carryovers.
2. No commits to main, no merges. No subagents. Report to lead-agent, not Brendan.
3. Don't touch `scripts/`, `services/`, `docs/sketches/`, the lake.

## Done means
1. Task 1 fixed at the cause and verified on the codespace in both themes; the breaking commit named.
2. `/pipeline` is a canvas in our palette with current numbers; zero `pax2` references in its files; the codespace shows it.
3. Both pushed on `ui-layer`; a report to lead-agent with the commits, what broke the transition, and anything deleted.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/21-ui-transition-and-pipeline-canvas.md and start; work in ~/Code/nsrgpt-ui-layer on branch ui-layer; report to lead-agent when each task lands.`
