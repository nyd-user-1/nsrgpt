import { shot, video } from "./media"
import { doc, type Doc } from "./types"

export const NAVIGATION: Doc[] = [
  {
    slug: "sidebar",
    title: "The sidebar",
    category: "navigation",
    summary: "Search, Chat, Charts and Data, your chats, and what every row's buttons do.",
    tags: ["Navigation"],
    body: `The circle button at the left of the header opens and closes the sidebar.

${shot("sidebar", "The sidebar: search, the pages A to Z, then your chats")}

## What's in it

1. **Search** on top. It opens the search. See [Search](${doc("search")}).
2. **Chat**, second.
3. **The rest, A to Z:** Charts, Data, Docs, Graph and Search. Charts and Data each open into their pages, hung off the row on branch lines.
4. **Your chats**, below a rule, grouped by day.
5. **The user panel** at the foot: the light and dark switch, and sign in or out.

## A row's buttons

Hover a row and two buttons show at its right.

- **↗** opens the row's page in the second panel. See [Second Panel](${doc("panel-2")}).
- **⋮** opens the row's menu: the page's path to copy, Open in panel, Favorite, Pin to top, Rename, Copy link, Hide and Archive.

A starred row keeps a star beside it. Pinned rows lead the menu under Pinned. Hidden rows show again from **Show hidden** at the menu's foot, and archived rows fold into **Archived** below it. All of it is kept in this browser.

## Your chats

Each chat's ⋮ holds Pin to top, Favorite, Rename, Copy link, Hide and Archive. The sliders above the list group it by date or not at all, and show hidden chats. Archived chats fold into their own group at the foot.

${video("guide-find-your-way", "Find your way around: the sidebar, the search and the Nav")}`,
  },
  {
    slug: "search",
    title: "Search",
    category: "navigation",
    summary: "Every chart, table, chat and page from one box, from the keyboard.",
    tags: ["Navigation", "Keys"],
    body: `⌘ K opens search from anywhere, or click **Quick search** at the top of the sidebar.

${shot("search", "Search open over a chart")}

## Searching

Type and the results rank as you go: titles that start with your words first, then titles containing them, then descriptions. Every word you type has to match somewhere.

## Scopes

The chips under the field narrow the search: All, Charts, Data, Chats and Pages.

- ← and → at the field's edges step through the chips.
- Typing \`/chart \`, \`/data \`, \`/chat \` or \`/page \` before your words picks the chip.
- Backspace in an empty field goes back to All.

## Opening a result

- **Enter** opens the highlighted result.
- **↗** on a result opens it in the second panel.
- **Esc** closes search.

${video("guide-search", "Search: open it, type, narrow it, open a result")}`,
  },
  {
    slug: "nav",
    title: "The Nav",
    category: "navigation",
    summary: "A page switcher at your pointer, from any header's empty space.",
    tags: ["Navigation"],
    body: `Click the empty space in any header and the Nav opens at your pointer.

${shot("nav", "The Nav open over the header")}

## Using it

- Type to find a page.
- Without typing, it lists your recent pages, then the pages, then every chart.
- **Enter** or a click opens a page on the side you opened the Nav from: the main page, or the second panel.
- **⌥ Enter**, or a row's arrow, opens it on the other side.

> Shift and a right-click on any of the site's links sends that link to the second panel.`,
  },
  {
    slug: "chart-to-chart",
    title: "Move between charts",
    category: "navigation",
    summary: "Step through the charts in the index's order, by button, key or menu.",
    tags: ["Navigation", "Charts", "Keys"],
    body: `The charts have an order: the index's, box by box. Stepping wraps at the ends.

## Ways to step

| How | Previous | Next |
|---|---|---|
| Header buttons | The left circle button | The right circle button |
| Keys | [ | ] |
| Arrow keys, until you click into the chart | ← | → |

## Jumping

- Click the header's title for every chart, by name.
- Open **Charts** in the sidebar.
- Search for it. See [Search](${doc("search")}).

## The transitions

- Moving forward, a box grows from the masthead's box into the full frame.
- Moving back, by the left button, [ or the browser's back button, the frame shrinks into the main container's top-left corner.
- Arriving at the index, the frame shrinks onto the masthead's main box.`,
  },
]
