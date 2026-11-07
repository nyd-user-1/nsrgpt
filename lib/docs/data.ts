import { shot, video } from "./media"
import { doc, type Doc } from "./types"

export const DATA: Doc[] = [
  {
    slug: "data-tables",
    title: "Data Tables",
    category: "data",
    summary: "Every chart's rows as a table: open it, page through it, and find the point you clicked.",
    tags: ["Data", "Tables"],
    body: `Every chart has a table of the rows it draws. The table reads the same file the chart does, so the numbers match to the last digit, and a file the chart already loaded comes from your browser's cache.

${shot("data-table", "Binding Energy per Nucleon's table")}

## Opening a table

- Click the chart. Its table opens in the second panel, on the row of the point you clicked.
- Or open **Data** in the sidebar and pick the chart by name.

## Reading it

- A hundred rows to a page; the arrows at the top step through the pages.
- ↑ and ↓ step through the rows.
- The page count and its arrows stay at the top as you scroll.

## Tables and their charts

A table opened from a chart stays tied to it: picking rows marks them on the chart. See [Pick and copy rows](${doc("select-rows")}).

${video("guide-data-table", "Read a chart's table: page through the rows and pick some")}`,
  },
  {
    slug: "select-rows",
    title: "Pick and copy rows",
    category: "data",
    summary: "Pick rows to mark them on the chart, and copy them out.",
    tags: ["Data", "Tables"],
    body: `## Picking

- A click picks a row; another click drops it.
- Shift ↑ ↓ grows the picked range from the keyboard.

The chart marks every picked row: a band on a candle or a bar, an outline on a dot or a cell. Leaving the table clears the chart's marks.

## Copying

Select the rows' text and copy, as you would anywhere.

> A table's address takes \`?row=\`: \`/viz/data/nebula?row=12\` opens on that row's page with the row marked.`,
  },
]
