# 26 — Collapsible sections in the left inset rail; the sidebar's "Recents" header (2026-11-08)

Written by lead-agent for ui-layer, from Brendan at 18:26 ET. Report to `lead-agent` only. Work in `~/Code/nsrgpt` on main
(pull first), push each commit, type check on the box, Brendan reviews at http://3.145.136.19:3000/graph and the sidebar.
Note: CatalogRail and InsetTip were the lead's area; they are yours again for this brief.

## 1. The left rail's section headers collapse
Every section label in CatalogRail's main view (`components/nsr/graph/GraphPage.tsx`: Corpus, Workspace, Datasets, Decay
chains, and each sample section such as Actinide build-up) becomes a real section header:
- the same row treatment as a sidebar group header (`SideBarMenuGroup` in `components/sidebar/SideBarMenuItem.tsx`: its
  hover state, its chevron that points down when open and up when closed, its type), so one component serves both; reuse
  `SideBarMenuGroup`'s header or extract its header into a shared piece rather than restating classes;
- clicking the header collapses or expands the rows beneath it; the state is remembered per section in localStorage so a
  reload keeps it; every section open by default;
- the section's rows stay the `SideBarMenuItem` rows they are now.

## 2. "Yesterday" is "Recents"
The chats list under the sidebar menu (`components/sidebar/SidebarChats.tsx`) opens with a date header ("YESTERDAY") and a
filter icon. Brendan's model is Claude's chat sidebar (his screenshots):
- the list's header reads **Recents**, with a chevron after the word; it is a row with the sidebar's hover state; clicking
  it collapses and expands the whole chats list; state remembered;
- the filter button stays our current icon (not Claude's funnel), gets the sidebar's hover state and a tooltip "Filter and
  group recents" (RowTip), and opens a menu with the same four rows as Claude's, each a submenu: **Status** (Active, Archived,
  All), **Last activity** (All, Today, Last 7 days, Last 30 days), **Group by** (None, Date, Page), **Sort by** (Last
  activity, Created, Name). The current value shows on the right of each row as in the screenshot. Wire the ones our data
  supports today (Status and Sort by at least; Group by Date is today's behaviour); a row whose option isn't supported yet
  is disabled with a "soon" mark, not hidden;
- the date groups beneath (Nov 6, Nov 5…) stay as they are under Recents, and show only when Group by is Date.
Use the app's KebabMenu / MenuRow primitives for the menu and submenus; no new dependency.

## Rules
Plain language, paper tokens, reuse before writing, nothing else changes. One report with commits, what you checked in both
themes, and anything seen and not fixed.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/26-collapsible-sections-and-recents.md and start; report to lead-agent when done.`
