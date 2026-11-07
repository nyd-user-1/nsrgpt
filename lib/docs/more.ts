import { GUIDES, video } from "./media"
import { doc, type Doc } from "./types"

export const CHAT: Doc[] = [
  {
    slug: "chat",
    title: "Chat",
    category: "chat",
    summary: "Ask about the corpus in plain words. Chat is being finished.",
    tags: ["Chat"],
    body: `Chat answers questions about nuclear data from the Nuclear Science References and the databases behind the charts, citing the papers it reads.

## NSR mode

Opened in NSR mode, every answer starts from the corpus: a lookup first, the numbers it returns, and the papers by their key numbers.

> Placeholder: Chat is being finished. This article will cover asking, NSR mode, citations and saved chats when it opens.`,
  },
]

export const FAQ: Doc[] = [
  {
    slug: "faq-data",
    title: "About the data",
    category: "faq",
    summary: "Where the numbers come from, how current they are, and why two charts can differ.",
    tags: ["FAQ", "Data"],
    body: `## Where does a chart's data come from?

From a snapshot of its source, built into a file the chart reads. The chart's box on the index, and its atlas entry, name the source. See [Sources](${doc("sources-overview")}).

## How current is it?

As current as the snapshot. Each source is pulled whole, then rebuilt. See [How the data is built](${doc("how-data-is-built")}).

## Why do two charts give different counts?

They read different sources or different selections. Binding Energy per Nucleon draws all 3,558 AME2020 nuclides; Half-Lives on the Chart of Nuclides draws the 3,420 ENSDF ground states with a half-life.

## Can I get the rows behind a chart?

Yes. Every chart has a table. See [Data Tables](${doc("data-tables")}).`,
  },
  {
    slug: "faq-using",
    title: "Using the site",
    category: "faq",
    summary: "Accounts, keys, panels and the browser.",
    tags: ["FAQ"],
    body: `## Do I need an account?

No. Every chart, table and article opens without one. See [Accounts and sign-in](${doc("accounts")}).

## A 3D chart won't stop turning.

Press, drag or scroll on it once. The turn stops for good. Space turns it on again.

## The arrow keys change the chart instead of moving the camera.

Click into the chart first. The frame takes a thin ring, and the arrows drive the camera until you press Esc.

## Where did my note go?

Closed notes are kept as Blocks tiles. Notes are kept in this browser, so another browser won't have them.

## Which browsers work?

Any current browser. [Nuclide Decay Heat](/viz/particles) needs WebGPU: current Chrome, Edge or Safari.`,
  },
]

export const RELEASE_NOTES: Doc[] = [
  {
    slug: "release-2026-11-07",
    title: "November 7, 2026",
    category: "releases",
    summary: "The help center, the sidebar and search.",
    tags: ["Release notes"],
    body: `## The help center

These docs: a front page, articles in ten topics, video guides, and a contents list that follows your reading.

## The sidebar

The sidebar is a menu now: search on top, Chat, then Charts, Data, Docs, Graph and Search, each row with ↗ for the second panel and ⋮ for its menu, then your chats.

## Search

⌘ K searches every chart, table, chat and page, with scope chips and the keys to drive it.`,
  },
  {
    slug: "release-2026-11-06",
    title: "November 6, 2026",
    category: "releases",
    summary: "The IAEA Live Chart, new charts, the right panel, keys and transitions.",
    tags: ["Release notes"],
    body: `## The IAEA Live Chart

I pulled the IAEA's Live Chart API in full: 17,670 requests, every one answered. Four charts came from it: Fission Product Yields, Ground-State Properties, Nuclide Decay Radiation and Decay γ-Ray Energies.

## New charts

- Nuclide Decay Heat: one gram of a nuclide heating a column of air.
- The decay network flows, pins chains and opens in 3D.
- The knowledge map in one page, with Select grid and 3D switches.

## The frame

- Charts keep the whole container; their controls and legends moved to the right panel.
- The chart type at the foot is a switcher.
- Headers carry each chart's physics name.
- Three pointers, the nearest point within 10 px, and the tooltip off the point at 45°.

## Keys and transitions

- Arrow keys on every table and on the index.
- [ and ] step charts; 3D charts take the camera keys once clicked.
- Pages move with ChartForward, ChartRoot and ChartBack.

## Everywhere

- No browser dropdowns: every choice uses the site's menu.
- Notes use pax-trinity's editor.`,
  },
  {
    slug: "release-2026-11-05",
    title: "November 5, 2026",
    category: "releases",
    summary: "NSRgpt opens: its own site, its own deploy, and charts that show what's picked.",
    tags: ["Release notes"],
    body: `## NSRgpt opens

NSRgpt started as NYSgpt cut to its nuclear science content, on its own site and its own deploy.

## Charts

- Every 3D chart turns the same way, and stops at your first touch.
- Charts mark the point under the pointer and the rows picked in a table.
- The correlation matrix opens a pair's scatter.
- Decay Chain Activity: a decay simulation per chain.
- Decay paths: the whole decay network as a route map.
- The decay network opens at once and lights a chain on hover.

## The right panel

One list, A to Z, with a Cloudflare row.`,
  },
]

export const GUIDES_PAGE: Doc[] = [
  {
    slug: "video-guides",
    title: "Video guides",
    category: "guides",
    summary: "Short videos that show each thing being done, start to finish.",
    tags: ["Guides"],
    body: GUIDES.map((g) => `## ${g.title}

${g.summary} Read more in [the article](${doc(g.article)}).

${video(g.name, g.title)}`).join("\n\n"),
  },
]
