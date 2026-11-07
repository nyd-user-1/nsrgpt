import { shot, video } from "./media"
import { doc, type Doc } from "./types"

export const PANELS: Doc[] = [
  {
    slug: "panel-2",
    title: "Second Panel",
    category: "panels",
    summary: "Keep two pages side by side: a chart and its table, or two charts.",
    tags: ["Panels"],
    body: `Any page can open in a second panel beside the one you're on. Each panel keeps its own page and its own header.

${shot("panel-2", "A chart in the main panel, and another in the second")}

## Ways to open one

- **↗** on any sidebar row, or on any search result.
- **Open in panel** in a row's ⋮ menu.
- The panel button at the bottom right of any box on the index.
- A click on a chart opens its table there.
- Shift and a right-click on any of the site's links.

## Closing it

The second panel's corner button closes it.

> A page open in the second panel can open a third the same way.

${video("guide-panel-2", "Open a second panel: from a sidebar row, then from a box")}`,
  },
  {
    slug: "right-panel",
    title: "The right panel",
    category: "panels",
    summary: "Each chart's controls, the themes, Blocks and the tools, in one list.",
    tags: ["Panels", "Right panel"],
    body: `The button at the right of the header opens the right panel: one list, A to Z.

| Row | What it opens |
|---|---|
| Ask NSRgpt | Chat |
| Blocks | Your saved notes and blocks |
| Cloudflare | Requests today, Workers and crons, against the plan's limits |
| Dev tools | The inspector and the page tools |
| Discord, Slack | The community channels |
| Theme | The six themes and their colours. See [Themes and appearance](${doc("themes")}) |
| Viz | Every chart, then the open chart's controls and legend. See [Controls and legends](${doc("chart-controls")}) |`,
  },
  {
    slug: "notes",
    title: "Notes",
    category: "panels",
    summary: "Draw a note anywhere with Shift, write in it, keep it.",
    tags: ["Panels", "Notes"],
    body: `Hold Shift and drag across any part of a page that isn't a button, a field or a picture. A dashed outline follows the pointer; let go and a note opens there, as large as you drew it.

${shot("notes", "A note drawn over a chart")}

## Writing

The note is a full editor: headings, lists, tables, links. Its toolbar sits at the top of the card.

## The note's menu

The ⋮ holds Favorite, Add to Blocks, Ask, Copy as Markdown, Download, Close and Delete.

- **Close** keeps the note. A Blocks tile opens it again.
- **Delete** removes it.

## Moving and sizing

Drag the grip to move it. Drag the bottom-right corner to resize it.

> Notes are kept in this browser. A Shift-click still extends a selection: drawing starts only once the pointer moves. Esc while drawing lets it go.

${video("guide-notes", "Take a note: draw it with Shift, then write in it")}`,
  },
  {
    slug: "blocks",
    title: "Blocks",
    category: "panels",
    summary: "The notes and views you keep, one click away.",
    tags: ["Panels", "Notes"],
    body: `Blocks keeps what you've saved: closed notes, and anything added with **Add to Blocks**. Open it from the right panel.

## Saving to Blocks

- A note's ⋮ menu: **Add to Blocks**.
- Closing a note keeps it as a Blocks tile.

> Placeholder: saving a chart with its selection and camera as a block is planned.`,
  },
]
