import { shot } from "./media"
import { doc, type Doc } from "./types"

export const GET_STARTED: Doc[] = [
  {
    slug: "welcome",
    title: "What is NSRgpt?",
    category: "get-started",
    summary: "What I hold, what I draw from it, and where to start.",
    tags: ["Basics"],
    body: `I'm charts, tables and search over nuclear structure and decay data: the Nuclear Science References corpus and the NNDC and IAEA databases. Every chart reads files built from those databases, so a page opens without waiting on anyone else's server.

${shot("home", "The index: the masthead's counts over every chart's box")}

## What I hold

| Source | What it is | How much |
|---|---|---|
| XUNDL | Unevaluated structure data, as published | 931,258 records |
| NSR | Nuclear Science References: papers and the nuclides they cover | 1,210,113 nuclide links |
| ENSDF | Evaluated structure and decay data | 3,276,986 records |
| EXFOR | Measured reaction data | 4,344,595 cross sections |

The masthead on the index shows these four. [Sources](${doc("sources-overview")}) has the rest: AME2020, NUBASE2020, CapGam, JEFF-3.1.1 and the IAEA Live Chart.

## What I draw

32 charts, each a page of its own. Every chart fills the main container; its controls and legend sit in the right panel. Each one has a table of its rows.

- Masses and binding energies, from AME2020.
- Half-lives, decay modes and decay chains, from ENSDF.
- Levels, first 2⁺ energies and transition strengths.
- Capture γ rays, fission yields and EXFOR cross sections.
- How well each nuclide is evaluated, and how much has been written about it.

> New here? Open any box on the index, hover a point, then read [Dynamic Charts](${doc("chart-pages")}).

## Where to go next

| If you want to | Start here |
|---|---|
| Find a chart | [The sidebar](${doc("sidebar")}) or [Search](${doc("search")}) |
| Read one chart well | [Dynamic Charts](${doc("chart-pages")}) |
| Know what a chart plots | [Chart atlas](${doc("atlas-masses")}) |
| Get the numbers behind a chart | [Data Tables](${doc("data-tables")}) |
| Keep two charts side by side | [Second Panel](${doc("panel-2")}) |
| Watch it done | [Video guides](${doc("video-guides")}) |`,
  },
  {
    slug: "accounts",
    title: "Accounts and sign-in",
    category: "get-started",
    summary: "What works without an account, and how an account is made.",
    tags: ["Basics", "Accounts"],
    body: `Every chart, table and article opens without an account. An account holds your settings, your usage and, once Chat opens, your chats.

| | Without an account | With an account |
|---|---|---|
| Open every chart and table | Yes | Yes |
| Search, notes and the second panel | Yes | Yes |
| Account, profile, settings and notifications | | Yes |

## How an account is made

Accounts are by invitation. Open the invitation's link to finish signing up; after that, sign in from the user panel at the foot of the sidebar.

## Signing out

The user panel at the foot of the sidebar holds sign out, beside the light and dark switch.

> Notes are kept in this browser, signed in or not. Clearing the browser's storage clears them.`,
  },
  {
    slug: "find-your-way",
    title: "Navigation",
    category: "get-started",
    summary: "The sidebar, the header, the right panel and the second panel: everything that frames every page.",
    tags: ["Basics", "Navigation"],
    body: `Every page sits in the same frame: the sidebar at the left, the page in the middle under its header, and the panels at the right.

${shot("sidebar", "The sidebar open beside a chart")}

## The sidebar

The circle button at the header's left opens it. Search is on top, then Chat, then the rest A to Z, then your chats. See [The sidebar](${doc("sidebar")}).

## The header

The header names the page. On a chart, the name is the physics: "Binding Energy per Nucleon", not "Scatter Plot". The chart's type sits at the foot of its frame.

- The circle buttons step to the previous and next chart.
- Clicking the title lists every chart.
- Hovering the title shows a copy button.
- Clicking the header's empty space opens [the Nav](${doc("nav")}).

## The right panel

The right panel holds each chart's controls and legend under Viz, plus Theme, Blocks, Dev tools and Cloudflare. See [The right panel](${doc("right-panel")}).

## The second panel

Any page can open beside the one you're on. See [Second Panel](${doc("panel-2")}).`,
  },
  {
    slug: "keyboard-shortcuts",
    title: "Keyboard shortcuts",
    category: "get-started",
    summary: "Every key I answer to, by where you are.",
    tags: ["Basics", "Keys"],
    body: `## Anywhere

| Keys | What they do |
|---|---|
| ⌘ K | Open search |
| Shift and drag | Draw a note |
| Esc | Close the open menu, search or note drawing |

## On the index

| Keys | What they do |
|---|---|
| Any arrow, first | Highlight the masthead's main box |
| ← → | Move within the masthead, or within the boxes below it; they never cross between the two |
| ↓ from the masthead | Down to the boxes below it |
| ↑ from the top row of boxes | Up to the masthead |
| ↑ ↓ among the boxes | Change rows |
| ← → past the end of a row | On to the next page of boxes, which comes into view at once |
| Enter | Open the highlighted box |
| Esc | Clear the highlight |

A first click highlights a box and a second opens it. A button inside a box works at once.

## On a chart

| Keys | What they do |
|---|---|
| [ ] | Previous and next chart, always |
| ← → | Previous and next chart, until you click into the chart |
| Esc | Give the arrows back to chart stepping |

## On a 3D chart, once clicked

| Keys | What they do |
|---|---|
| ← → | Orbit |
| ↑ ↓ | Tilt |
| ⌘ ↑ ↓, or + − | Zoom |
| Shift and arrows | Pan |
| Space | Turn on or off |
| 0 | Reset the camera |
| Esc | Leave the camera |

## In a table

| Keys | What they do |
|---|---|
| ↑ ↓ | Step through the rows |
| Shift ↑ ↓ | Grow the picked range |

## In search

| Keys | What they do |
|---|---|
| ↑ ↓ or Tab | Move through the results |
| ← → at the field's edges | Step the scope chips |
| Enter | Open the result |
| Esc | Close |`,
  },
  {
    slug: "themes",
    title: "Themes and appearance",
    category: "get-started",
    summary: "Light, dark and the four other themes, and what each changes.",
    tags: ["Basics", "Appearance"],
    body: `The user panel's switch flips light and dark. The right panel's Theme row holds all six themes and their colours.

## The six themes

| Theme | Ground |
|---|---|
| PAX Light | The default: a cool mist, cards lifting to white |
| PAX Dark | A dark navy |
| Light | White throughout |
| Dark | Near-black greys |
| Vercel | Black, with Vercel's blue |
| VS Code | VS Code's Dark+ greys |

## What a theme changes

Every surface, rule and type colour comes from the theme. The charts keep their own colours for what they encode, such as decay mode or parity, and redraw their axes and labels for a dark ground.

> Your theme is kept in this browser.`,
  },
]
