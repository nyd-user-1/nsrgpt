import { defineSpec } from "../../template"
import { FPS, SIZES, sec } from "../../theme"
import { DecayChainProps, stepSeconds } from "./schema"

// The U-238 series' main path, from the cached API's /icrp/chain/U-238 (ICRP-107), 19 Nov 2026: the members on the
// branch taken more than half the time, in order.
export const decayChainSpec = defineSpec({
  id: "decay-chain",
  name: "Decay chain",
  description:
    "A decay chain from its parent to its stable end, wide: the parent lands, then each arrow draws labelled with the mode it leaves by (α, β−, β+, IT) and each daughter springs in with its half-life, in order; the stable end is ringed last. The page fetches the chain; name the parent.",
  propsSchema: DecayChainProps,
  fps: FPS,
  ...SIZES.wide,
  durationInFrames: (p) => sec(2.6 + (p.steps.length - 1) * stepSeconds(p.steps.length)),
  fixture: {
    title: "The U-238 decay series",
    steps: [
      { nuclide: "U-238", halfLife: "4.468×10⁹ y", mode: "A" },
      { nuclide: "Th-234", halfLife: "24.1 d", mode: "B-" },
      { nuclide: "Pa-234m", halfLife: "1.17 min", mode: "B-" },
      { nuclide: "U-234", halfLife: "245,500 y", mode: "A" },
      { nuclide: "Th-230", halfLife: "75,380 y", mode: "A" },
      { nuclide: "Ra-226", halfLife: "1,600 y", mode: "A" },
      { nuclide: "Rn-222", halfLife: "3.8235 d", mode: "A" },
      { nuclide: "Po-218", halfLife: "3.1 min", mode: "A" },
      { nuclide: "Pb-214", halfLife: "26.8 min", mode: "B-" },
      { nuclide: "Bi-214", halfLife: "19.9 min", mode: "B-" },
      { nuclide: "Po-214", halfLife: "164.3 µs", mode: "A" },
      { nuclide: "Pb-210", halfLife: "22.2 y", mode: "B-" },
      { nuclide: "Bi-210", halfLife: "5.013 d", mode: "B-" },
      { nuclide: "Po-210", halfLife: "138.376 d", mode: "A" },
      { nuclide: "Pb-206", stable: true },
    ],
    source: "ICRP Publication 107, main branch",
  },
})
