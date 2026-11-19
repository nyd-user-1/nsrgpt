import { defineSpec } from "../../template"
import { FPS, MOTION, SIZES, sec } from "../../theme"
import { HalfLifeBarsProps } from "./schema"

// Six nuclides' half-lives from the cached API's /nuclide/{name} (ENSDF 2026-11-05), 19 Nov 2026.
export const halfLifeBarsSpec = defineSpec({
  id: "half-life-bars",
  name: "Half-lives",
  description:
    "Two to twelve nuclides' half-lives on a log scale of time with marks a reader knows (a second, a day, a year, a billion years), wide: bars draw from the axis in a stagger, longest first, each half-life appearing at its bar's end. The page fetches the half-lives; name the nuclides.",
  propsSchema: HalfLifeBarsProps,
  fps: FPS,
  ...SIZES.wide,
  durationInFrames: (p) => sec(0.6 + Math.min(MOTION.stagger, 4 / p.rows.length) * (p.rows.length - 1) + MOTION.draw + 2),
  fixture: {
    title: "Half-lives of six familiar radionuclides",
    rows: [
      { label: "Pu-239", seconds: 760837485860, text: "24,110 y" },
      { label: "Am-241", seconds: 13651526187.6, text: "432.6 y" },
      { label: "Cs-137", seconds: 949232334.08, text: "30.08 y" },
      { label: "Sr-90", seconds: 912310730.66, text: "28.91 y" },
      { label: "Co-60", seconds: 166344192, text: "1,925.28 d" },
      { label: "I-131", seconds: 693377.28, text: "8.0252 d" },
    ],
    source: "ENSDF, 5 Nov 2026",
  },
})
