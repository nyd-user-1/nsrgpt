# 25 — RightInsetPanel: a drill-down menu; light-theme tabs; the sidebar's icon hover in both rails (2026-11-08)

Written by lead-agent for ui-layer, from Brendan's review of brief 24 at 17:46 ET. Report to `lead-agent` only. Work in
`~/Code/nsrgpt` on main (pull first), push each commit, type check on the box through SSM; Brendan reviews at
http://3.145.136.19:3000/graph.

## 1. The right panel opens on a menu and drills down
Brendan liked the rail tabs (the open and close tab on each side stays). The three views inside the right panel are not
three tabs: the panel's top layer is a menu, and each row drills down to its view.
- **Top layer:** the panel title, then one row per view, in the panel's row style with its icon: Papers, Config, Features.
  The row's trailing mark is the same arrow the app already uses on a drill-down row (the ↗ in Brendan's screenshot).
- **Drilling:** clicking a row replaces the menu with that view. The view's header carries the back arrow the right-side
  panel already uses to return from a drill-down layer to the top layer (Brendan's words); clicking it returns to the menu.
  Reuse that existing header and arrow; don't draw a new one.
- **Selecting a node or edge** drills into Papers, as today. Clicking the pane returns to the menu, not to a remembered
  view. The settings button on the toolbar drills into Config; the run-history button into Papers. First load: the menu.
- Remove the three view tabs from brief 24. Keep the open and close rail tab.
- Rename the inner title from "Graph Features" to what the panel is at that layer: the top layer's title is the panel's
  name; the Features view's title is "Graph Features".

## 2. Rail tabs in the light themes
The rail tabs (open and close, both sides) show dark icons on a dark ground in the light themes. Fix the tab's colours so
the icon reads in every theme: paper ground, ink icon, the hover tint, from the paper tokens.

## 3. The sidebar's icon treatment in every inset rail
The standard is the sidebar menu row's icon as it is now (`components/sidebar/SideBarMenuItem.tsx` at main: `ICON_REST`,
`ICON_ON`, `AnimateIcon asChild animateOnHover` on the row, the `group/item` hover, size 18, stroke 1.75 at rest and
2.25 when on). Apply it to every icon inside a left or right inset rail, on every page that has one: /graph's two panels
(the menu rows, the catalog's section rows, the Features rows, Config), /docs's left panel, /chat's right panel, and any
other inset rail. Hovering the row (the parent) animates the icon and gives it the two tones; the icon alone does
nothing. Reuse the sidebar's constants; don't restate the classes.

## Rules
Plain language; paper tokens only; no new dependencies; nothing else changes. One report with the commits, what you
checked in dark and light, and anything seen and not fixed.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/25-inset-panel-menu-and-icons.md and start; report to lead-agent when done.`
