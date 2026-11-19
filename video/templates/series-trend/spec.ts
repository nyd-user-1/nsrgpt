import { defineSpec } from "../../template"
import { FPS, SIZES } from "../../theme"
import { SeriesTrendProps } from "./schema"

// EXFOR's U-235(n,f) cross-section datasets by the five years they were published (the cached API's /exfor/points,
// 397 datasets, 19 Nov 2026).
const SPANS: [string, number][] = [
  ["1940", 20], ["1945", 2], ["1950", 6], ["1955", 40], ["1960", 15], ["1965", 49], ["1970", 55], ["1975", 78], ["1980", 35], ["1985", 24],
  ["1990", 8], ["1995", 2], ["2000", 24], ["2005", 6], ["2010", 5], ["2015", 20], ["2020", 2], ["2025", 4],
]

export const seriesTrendSpec = defineSpec({
  id: "series-trend",
  name: "Trend",
  description:
    "Up to four series across a shared run of labels (years, mass numbers, energies), wide: each line drawn left to right behind a leading dot, an optional callout springing in as the line passes its point, the last value labelled at each line's end, the source at the foot.",
  propsSchema: SeriesTrendProps,
  fps: FPS,
  ...SIZES.wide,
  durationInFrames: 8 * FPS,
  fixture: {
    title: "U-235 fission cross-section datasets in EXFOR",
    series: [{ name: "Datasets", points: SPANS.map(([label, value]) => ({ label, value })) }],
    unit: "",
    annotation: { atIndex: 7, text: "78 datasets, 1975 to 1979" },
    source: "EXFOR, U-235(n,f) σ, five-year spans",
  },
})
