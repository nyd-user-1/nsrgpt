# 49 — The graph rail: Workspace fixed at the top with New canvas; Corpus renamed Database (2026-11-09)

You're `window-2-ui-layer`. Written by `lead-agent` (Fable); Brendan asked at 16:35 ET and is back at 16:45 to look
on the dev box (http://3.150.112.32:3000/graph). Report to `lead-agent` by SendMessage in one line when pushed.
Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`). No questions.

## Rules
1. `~/Code/nsrgpt` on main, shared: `git pull --rebase --autostash origin main`, commit in one step with explicit
   paths, push right after. Type-check on the dev box through SSM before pushing. Other windows have uncommitted
   files in `scripts/parse/` and `services/nsr-api/`; never add them.
2. Reuse: the rail's rows are `SideBarMenuItem`, its headers `SideBarSection` (`components/sidebar/SideBarMenuItem.tsx`),
   the list `InsetBody` (`components/nsr/graph/InsetPanel.tsx`). No new components; paper palette; plain language.

## The rail (components/nsr/graph/GraphPage.tsx, the main view around line 745)
Today: Corpus (Papers, Authors, Nuclides, Reactions, EXFOR), Workspace (Library, Views, Recipes), Datasets, Diagrams,
all in one scrolling InsetBody, A to Z by section.
1. **Workspace first and fixed.** Workspace sits at the top of the rail as a fixed block: it does not scroll; the
   other sections scroll beneath it (its block is outside, above, the scrolling InsetBody, with the paper
   background so rows passing under it are covered, and a bottom rule). It is always open: no fold, no remembered
   state (`SideBarGroupHeader` without the toggle, or the section rendered open with the chevron off). Add a little
   more room above it than the other sections have, so it doesn't hug the panel's top edge (about 10 px more).
2. **Workspace's rows, A to Z:** Library, New canvas, Recipes, Views. New canvas takes a Plus (lucide `Plus`) icon and
   does what picking a dataset with no seed does at line 1503: snapshot, empty the stores, `setEdges([])`,
   `setNodes([])`, clear the selection and the edge info, `setLoadedView(null)`, then the rail stays where it is.
   Wire it through `onSelect`, as the other rows act instead of navigating; href stays `/graph`.
3. **Corpus becomes Database.** The label, the `group` prop on its rows, and the storage key
   (`graph:section:database`; the old key can be left to expire). Nothing else about its rows changes.
4. **Order beneath Workspace, A to Z:** Database, Datasets, Diagrams.
5. Both themes; the fixed block must not cover the first row of Database at any panel height; the drill-down views
   (a row's list) are unchanged.

## Done means
Pushed, type check green, checked on the box in both themes, one line to `lead-agent`.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/49-graph-rail-workspace-database.md and do it; report to lead-agent when pushed.`
