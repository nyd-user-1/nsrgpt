import { shot, video } from "./media"
import { doc, type Doc } from "./types"

export const CHARTS: Doc[] = [
  {
    slug: "chart-pages",
    title: "Dynamic Charts",
    category: "charts",
    summary: "The frame, the pointer, the tooltip and the chart type: what every chart page has in common.",
    tags: ["Charts"],
    body: `Every chart is a page of its own, and every chart page works the same way. The chart fills the main container, edge to edge. Its controls and legend are in the right panel, so nothing sits on top of the data.

${shot("chart-nebula", "Binding Energy per Nucleon: 3,558 AME2020 nuclides")}

## The frame

The header names what the chart shows. The chart's type sits at the frame's foot, at the left: Scatter Plot, Heatmap, Candlestick Chart. When the same data fits other types, that label is a menu. See [Switch chart type](${doc("chart-types")}).

## The pointer

I use three pointers, so you can tell what a click will do before you make it.

- A hand over anything you can press: buttons, switchers, rows.
- A scope over a chart's plot: an open cross, so the point you're aiming at stays in view, inside a faint ring.
- The arrow everywhere else.

The ring is the hover's reach. The point nearest the pointer, within 10 px, takes the hover, so a small dot doesn't need a steady hand.

## The tooltip

${shot("tooltip", "A point hovered: its tooltip sits off it at 45°")}

The tooltip sits 26 px off the point, up and to the right, so it never covers the point or the rules through it. At the right edge it moves up and to the left; at the top, below.

## Clicking

A click on a chart opens its table in the second panel, on the row of the point you clicked. A drag, such as an orbit or a zoom, isn't a click. See [Data Tables](${doc("data-tables")}).

## Moving on

The circle buttons in the header, and the [ and ] keys, step to the previous and next chart. See [Move between charts](${doc("chart-to-chart")}).

${video("guide-read-a-chart", "Read a chart: open it, hover a point, switch its type")}`,
  },
  {
    slug: "chart-controls",
    title: "Controls and legends",
    category: "charts",
    summary: "Where each chart's settings and key live, and how to reach them.",
    tags: ["Charts", "Right panel"],
    body: `A chart's controls and legend live in the right panel, under Viz, never inside the frame. The chart keeps the whole container.

## Opening them

1. Open the right panel from the header's button at the right.
2. Choose **Viz**. It lists every chart.
3. Choose the chart you're on. Its controls and legend open a layer below the list.

## What's there

- **Legends.** Each series or class, with a switch to show or hide it. Hiding a class leaves the others in their colours.
- **Switches.** Log axes, 3D, a select grid: whatever the chart offers.
- **Pickers.** A nuclide, an element, an isotope chain. Every picker is the site's own menu.
- **Sliders.** Time, energy windows and limits.

> Nothing here is a browser dropdown. Every choice opens the site's menu, in your theme.`,
  },
  {
    slug: "three-d",
    title: "3D charts",
    category: "charts",
    summary: "How the 3D charts turn, and the keys that drive the camera.",
    tags: ["Charts", "3D", "Keys"],
    body: `Eleven charts are three-dimensional. Each opens with a slow turn, 3° a second, that stops for good at your first press, drag or scroll.

${shot("engaged", "A 3D chart clicked: the frame's ring and the camera's keys")}

## The mouse

- Drag to orbit.
- Scroll to zoom.
- Shift and drag to pan.

## The keys

Click into the chart first. The frame takes a thin ring and lists the camera's keys at its foot.

| Keys | What they do |
|---|---|
| ← → | Orbit |
| ↑ ↓ | Tilt |
| ⌘ ↑ ↓, or + − | Zoom |
| Shift and arrows | Pan |
| Space | Turn on or off |
| 0 | Reset |
| Esc | Leave the camera; the arrows step charts again |

## Which charts are 3D

[Radioactive Decay Simulation](/viz/decay), [Decay Populations Over Time](/viz/decay2), [Binding Energy Surface](/viz/surface), [First 2⁺ Energy, B(E2) and Z](/viz/scatter3d), [EXFOR Cross Sections](/viz/scatter3d-dataset), [Ground-State Properties](/viz/explorer), [Adopted Level Energies](/viz/levels), and the 3D views of [ENSDF Evaluation Coverage](/viz/knowledge), [Nuclide Decay Network](/viz/graph), [Fission Product Yields](/viz/fission-yields) and [Nuclide Decay Heat](/viz/particles).

${video("guide-3d-camera", "Turn a 3D chart: take the camera, orbit, zoom and leave")}`,
  },
  {
    slug: "chart-types",
    title: "Switch chart type",
    category: "charts",
    summary: "Draw the same data another way, from the label at the frame's foot.",
    tags: ["Charts"],
    body: `The chart's type sits at the foot of its frame. When the data fits more than one type, the label is a menu: pick another type and the same data redraws.

${shot("chart-type", "The chart-type menu open at the frame's foot")}

## Which types fit

A metric with one value per nuclide, such as binding energy, half-life or separation energy, fits six types:

| Type | How it draws the value |
|---|---|
| Scatter Plot | By mass number A |
| Heatmap | On N and Z |
| 3D Scatter Plot | Over N and Z, the value as height |
| Bar Chart | Ranked |
| Line Chart | By N, a line per element |
| Bubble Chart | On N and Z, sized by the value |

Some types are pages of their own: picking one goes to that page. The rest draw on the metric's page and add \`?view=\` to its address, so a link opens the same view.`,
  },
]
