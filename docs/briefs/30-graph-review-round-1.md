# 30 — /graph after Brendan's first review: placeholders, seeds, menus, toolbar, tooltips (2026-11-08, 22:15 ET)

Written by lead-agent for ui-layer. Report to `lead-agent` only; no questions; one report at the end. Work in
`~/Code/nsrgpt` on main, pull before each commit, push each commit, CI type-checks every push. parsing-2 works beside you
on `lib/diagram/**` (brief 31: new specs); don't touch those files. The box pulls main every 20 s while it runs.

## 1. Placeholders out, seeds in (CatalogRail's drilled views in GraphPage.tsx)
- Library (files): remove "Everything ever dropped on a canvas. Click to add to this one." and "Nothing here yet — drop a
  file anywhere on the canvas." Seed three real files from the lake so the list shows what the Library is for: the
  2011CH57 paper's PDF if `files/pdfs/` holds it (else another paper PDF the chat has cited), the EXFOR entry 10001 as its
  X4 text, and the ENSDF 60CO dataset card. Use the existing LibFile shape and the existing upload path (the S3 `files/`
  prefix the dock uses); the rows must open and add to the canvas as today.
- Views: remove "Saved canvases, exactly as arranged. Click to load onto this one." and "No saved views yet — arrange a
  canvas and hit Save." Seed three saved views through the same save path the Save button uses: "Thorium series, discs",
  "s-process, Ag to Sb", "137Cs neighbourhood" (centre 137Cs, expand papers once).
- Recipes: remove the equivalent two lines. Seed three recipes (saved views with prompt steps): "Summarise the papers on
  this canvas", "Measured against evaluated for the selected reaction", "Trace this decay chain and list the half-lives".
  Each must run with Run.

## 2. The rows' kebab menu, every SideBarMenuItem
Swap the header and the foot: the header shows the row's title with its type or group beneath in the mono small style
("Ag to Sb" over "s-process"); the foot shows the path chip, click to copy, as the header did. Diagram rows' type is the
spec's subtype label; other rows keep their group.

## 3. The Type rows go
Remove the Type picker row from every section (the type now reads in the kebab header). Keep the sections, the headers,
the folding and the stored state.

## 4. Toolbar (top-right Panel)
Collapsed: two circles, the plus toggle at the left and the Config button at the right. Open: between them, left to
right: a plain plus button (adds a prompt node, the toggle's original job), Prompt, Run, Save, then Reset, then Back and
Forward. The toggle shows × while open. Reset restores the loaded diagram to its page-load layout and config. Back and
Forward step the diagram's change history and appear only once a change has been made; none made, none shown. The
500 ms fold stays. The Config button never moves.

## 5. Search bar
Clicking the search circle opens the bar but does not focus the input; the reader clicks into it, and only then does the
suggestions list open.

## 6. Names
The Config view's inner title still reads "<ReactFlow /> Props"; it reads "Config". Check the panel for any other
leftover of that phrase.

## 7. Bottom-right
Replace the Chat button with a group: the loaded diagram's title, then two buttons, Share (copies the diagram's
`/graph?diagram=<id>` link, using the Web Share API where the browser has it) and Copy (copies the canvas as a PNG to the
clipboard, as the chart pages' copy does if one exists; otherwise html-to-image is already a dependency of React Flow's
examples only if present in package.json, so check before adding anything). No diagram loaded: the group shows the view's
name or "Canvas". The chat dock stays reachable from a node's Ask action.

## Done means
Each item checked on the box in both themes; CI green; one report with commits and anything seen and not fixed.
