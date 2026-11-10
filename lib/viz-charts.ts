// The /viz chart pages in the index's box order (2026-11-04): the boxes deal them out in this order, the framed
// pages' prev/next walk it (wrapping at the ends), and the header's switcher lists it. Each entry names its chart
// TYPE and describes its variables (Brendan, 2026-11-04). The header's own name for each page is
// lib/header-titles.ts. Static pages, so the links prefetch: served as files, they cost the worker nothing.

/** `lines`: the box's description on the index (Brendan, 2026-11-06): its axes, one a line, then its source. `name`: the
 *  box's name on the contents plate where it differs from the page's header title (brief 36: /viz/chart's box reads Nuclides). */
export type VizChart = { href: string; title: string; body: string; lines: string[]; name?: string }

export const VIZ_CHARTS: VizChart[] = [
  { href: "/viz/nebula", title: "Scatter Plot", body: "x mass number A · y binding energy per nucleon: all 3,558 AME2020 nuclides, coloured by decay mode. The top of the curve is ⁶²Ni.", lines: ["X: Mass Number A", "Y: Binding Energy per Nucleon", "Source: AME2020"] },
  { href: "/viz/rainfall", title: "Stacked Area Chart", body: "x mass number A · y ENSDF nuclides at that A, stacked by primary decay mode: stable, β−, β+/EC, α, fission, p, n.", lines: ["X: Mass Number A", "Y: Nuclides by Decay Mode", "Source: ENSDF"] },
  { href: "/viz/bar-large", title: "Bar Chart", body: "x 2,958 radioactive nuclides, ranked · y half-life on a log axis, ¹²⁸Te's 10³² s down to 10⁻²² s.", lines: ["X: Nuclides, Ranked", "Y: Half-Life (log)", "Source: ENSDF"] },
  { href: "/viz/weight", title: "Scatter Plot", body: "x E(2⁺) · y B(E2), both log: 751 even-even nuclides. Near a magic number the first 2⁺ sits high and weak; midshell, low and strong.", lines: ["X: E(2⁺) (log)", "Y: B(E2) (log)", "Source: NNDC B(E2)"] },
  { href: "/viz/heatmap", title: "Heatmap", body: "x N · y Z · heat log₁₀ half-life in decade bands, 3,420 ENSDF ground states; stable nuclides in ink.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Source: ENSDF"] },
  { href: "/viz/scatter3d", title: "3D Scatter Plot", body: "x E(2⁺) · y B(E2), both log · z proton number Z: the 751 even-even nuclides with both, in layers by element.", lines: ["X: E(2⁺) (log)", "Y: B(E2) (log)", "Z: Proton Number Z", "Source: NNDC B(E2)"] },
  { href: "/viz/scatter3d-dataset", title: "3D Scatter Plot", body: "x log incident energy · y year · z log cross section: 50,000 EXFOR measurements sampled from 4.3 million, coloured by projectile.", lines: ["X: Incident Energy (log)", "Y: Year", "Z: Cross Section (log)", "Source: EXFOR"] },
  { href: "/viz/simplex", title: "Strip Plot", body: "x product nucleus by A · y γ energy: every thermal-capture γ line in CapGam, 78,746 over 260 nuclei, shaded by intensity.", lines: ["X: Product Nucleus by A", "Y: γ-Ray Energy", "Source: CapGam"] },
  { href: "/viz/surface", title: "3D Surface Plot", body: "x N · y Z · z binding energy per nucleon as terrain, from the AME2020 masses; the ridge is the valley of stability.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Z: Binding Energy per Nucleon", "Source: AME2020"] },
  { href: "/viz/graph", title: "Network Graph", body: "Nodes the 3,420 ENSDF nuclides, coloured by decay mode; 4,783 edges, each from a nuclide to the daughter of one of its decay modes.", lines: ["Nodes: Nuclides", "Edges: Parent to Daughter", "Source: ENSDF"] },
  { href: "/viz/chart", name: "Nuclides", title: "Nuclide Chart", body: "x N · y Z: every ENSDF nuclide as a box in its decay family's colour, the magic numbers ruled. Click a box for its card: Jπ, half-life, mass excess, binding, mass, Q-values, separation energies, decay modes and major radiations.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Source: ENSDF, AME2020, NUBASE2020 (IAEA Live Chart)"] },
  { href: "/viz/structure", title: "Heatmap", body: "x N · y Z: every nuclide with an ENSDF or XUNDL dataset, coloured by years since its evaluation's literature cutoff or by XUNDL sets compiled since. With it, the ENSDF evaluation index: each mass chain's citation, evaluators, cutoff and XUNDL sets since.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Source: ENSDF, XUNDL"] },
  { href: "/viz/reactions", title: "Flow Map", body: "x N · y Z: every ENSDF decay step as a line, coloured by mode, with one route lit from any nuclide, downstream or upstream. Each light moves faster the shorter its parent's half-life.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Source: ENSDF"] },
  { href: "/viz/matrix", title: "Correlation Matrix", body: "9×9 Pearson r across log T½, Qα, Qβ−, Sₙ, Sₚ, log E(2⁺), log B(E2), mass excess and log level count, over the 475 nuclides with all nine. Navy moves together; red apart.", lines: ["X: Nine Nuclear Properties", "Y: Nine Nuclear Properties", "Source: ENSDF, AME2020"] },
  { href: "/viz/decay", title: "3D Simulation", body: "x N · depth Z · height log₁₀ half-life, 3,420 ENSDF ground states. Each decays at its measured rate, scaled, and steps to its daughter.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Z: Half-Life (log)", "Source: ENSDF"] },
  { href: "/viz/decay2", title: "3D Surface Plot", body: "The decay simulation as a surface: x N · y Z · height √ population. It opens flat on every ground state and deforms as decays run.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Z: Population", "Source: ENSDF"] },
  { href: "/viz/explorer", title: "3D Scatter Plot", body: "Any ground-state property on x, y and z, each with log and limits: half-life, Q-values, separation and binding energies, moments, charge radius, abundance, spin, and 46 fission-yield series. 3,386 nuclides from the IAEA Live Chart.", lines: ["X: Any Ground-State Property", "Y: Any Ground-State Property", "Z: Any Ground-State Property", "Source: IAEA Live Chart"] },
  { href: "/viz/fission-yields", title: "Line Chart", body: "x mass number A · y yield per fission, log: JEFF-3.1.1 independent yields for eight fissioning nuclides at thermal, fast and 14 MeV, from the IAEA Live Chart; opens on U-233, U-235 and Pu-239 at thermal. In 3D, one parent's products on N–Z.", lines: ["X: Mass Number A", "Y: Yield per Fission (log)", "Source: JEFF-3.1.1"] },
  { href: "/viz/radiation", title: "Stick Spectrum", body: "x energy · y intensity per 100 decays, both log: every α line, β spectrum, γ ray, X-ray and electron one nuclide's decay gives off, and where the energy goes. ENSDF through the IAEA Live Chart.", lines: ["X: Energy (log)", "Y: Intensity per 100 Decays (log)", "Source: ENSDF"] },
  { href: "/viz/gamma-lines", title: "Stick Spectrum", body: "x γ energy · y intensity per 100 decays, linear or log: one nuclide's decay lines, Co-60's 1173 and 1332 keV to start, any ground-state emitter in ENSDF through the picker. Find by energy: type a peak's energy and a window; the emitters inside list strongest first, with half-lives.", lines: ["X: γ-Ray Energy", "Y: Intensity per 100 Decays (log)", "Source: ENSDF"] },
  { href: "/viz/particles", title: "Particle Simulation", body: "One gram of a nuclide heats a 1 m column of air at its decay heat, from the Bateman solution and AME2020 Q-values. Its five hottest chain members each vent their own smoke into the moving air.", lines: ["Heat: Decay Heat of One Gram", "Source: ENSDF, AME2020"] },
  { href: "/viz/decay-chain", title: "Line Chart", body: "x time · y quantity, activity or atoms, all log: every member of one nuclide's decay chain, from the exact Bateman solution. Opens on the ²⁴¹Pu chain as quantities over 1 to 10⁹ years, each member named on its curve, Σ in ink and a marker to drag along time; the four decay series start from their heads.", lines: ["X: Time (log)", "Y: Quantity, Activity or Atoms (log)", "Source: ENSDF"] },
  { href: "/viz/knowledge", title: "Tile Map", body: "x N · depth Z, 7,986 nuclides: tiles sized by adopted levels, or columns as tall in 3D, coloured by years since the ENSDF evaluation; grey squares are studied but never evaluated. Select grid picks 10 × 10 blocks.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Source: ENSDF, NSR"] },
  { href: "/viz/spectra", title: "Stick Spectrum", body: "The line strips in 2D with a zoom slider to stretch a run of nuclei; a click opens that nucleus's full capture-γ spectrum beside them.", lines: ["X: Product Nucleus by A", "Y: γ-Ray Energy", "Source: CapGam"] },
  { href: "/viz/gamma-atlas", title: "Heatmap", body: "x γ energy in 25 keV bins · y product nucleus by A; heat the bin's summed capture-γ intensity per 100 captures.", lines: ["X: γ-Ray Energy", "Y: Product Nucleus by A", "Source: CapGam"] },
  { href: "/viz/gamma-punchcard", title: "Punch Card", body: "x γ energy in 0.5 MeV bins · y element; heat the summed capture-γ intensity, averaged over the element's product nuclei.", lines: ["X: γ-Ray Energy", "Y: Element", "Source: CapGam"] },
  { href: "/viz/levels", title: "3D Scatter Plot", body: "x N · depth Z · height level energy, 0–10 MeV: 139,868 ENSDF adopted levels over 3,350 nuclides. The selected nuclide's gamma transitions fall level to level.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Z: Level Energy", "Source: ENSDF"] },
  { href: "/viz/first-excited", title: "Bar Chart", body: "x Z · y E(2⁺), log: 980 even-even nuclides as points, then folded into one bar per element, the mean. Z = 20, 28, 50 and 82 stand above their neighbours.", lines: ["X: Proton Number Z", "Y: E(2⁺) (log)", "Source: ENSDF"] },
  { href: "/viz/level-spans", title: "OHLC Chart", body: "One isotope chain at a time: each bar from the ground state to the highest known level, ticks at the first excited level (left) and the median (right), MeV.", lines: ["X: Isotope", "Y: Level Energy", "Source: ENSDF"] },
  { href: "/viz/level-candles", title: "Candlestick Chart", body: "2,371 nuclides by A, one candle each: body from the first excited level to the median, wick from the ground state to the highest known level, MeV.", lines: ["X: Mass Number A", "Y: Level Energy", "Source: ENSDF"] },
  { href: "/viz/separation", title: "Candlestick Chart", body: "Neutron separation energy along each isotope chain: a candle from Sₙ(N−1) to Sₙ(N), so pairing shows as alternation. Bars: ENSDF levels known.", lines: ["X: Neutron Number N", "Y: Neutron Separation Energy", "Source: AME2020"] },
  { href: "/viz/nuclide-card", title: "Radar Chart", body: "One nuclide's half-life, Qα, Qβ−, Sₙ, Sₚ and E(2⁺) as a polygon, with a second nuclide overlaid.", lines: ["Spokes: T½, Qα, Qβ−, Sₙ, Sₚ, E(2⁺)", "Source: ENSDF, AME2020"] },
  { href: "/viz/isotope-radar", title: "Radar Chart", body: "One element at a time, every isotope as a translucent polygon on the same six spokes; the timeline walks Z with a play button. Neutron-poor runs cool, neutron-rich warm.", lines: ["Spokes: T½, Qα, Qβ−, Sₙ, Sₚ, E(2⁺)", "Source: ENSDF, AME2020"] },
  { href: "/viz/literature", title: "Bubble Chart", body: "x neutrons N · y protons Z · size and glow log₁₀ papers. All 7,799 nuclides the literature touches.", lines: ["X: Neutron Number N", "Y: Proton Number Z", "Source: NSR"] },
  // Placeholders (Brendan, 2026-11-08): two decay-chain charts to build, each linked to the illustration to match until then.
  { href: "https://en.wikipedia.org/wiki/Decay_chain#/media/File:Radioactive_decay_chains_diagram.svg", title: "Placeholder", body: "The four decay series on one Z against N grid, α and β steps as arrows: the Flow Map's data in the textbook form. To build, beside the Flow Map, not instead of it.", lines: ["Placeholder", "Source: Wikipedia, Decay chain"] },
]

/** Tables with a box of their own on the contents plate (brief 35, 2026-11-09). Not charts: they stay out of the chart
 *  list's prev and next and the header's switcher; the sidebar and search list them with the other tables. */
export const PLATE_TABLES: (VizChart & { name: string })[] = [
  { href: "/viz/data/reactions", name: "Reactions", title: "Table", body: "Every EXFOR target, reaction and quantity: the entries, subentries, datasets and data points measured for each. Sorts on every column; a row opens the EXFOR datasets for its target and reaction.", lines: ["Rows: Target, Reaction, Quantity", "Columns: Entries, Subentries, Data Points", "Source: EXFOR (IAEA X4Pro and J4)"] },
  { href: "/viz/data/nuclides", name: "Nuclides Table", title: "Table", body: "One row per ground state: Z, N, A, Jπ, half-life, decay modes, mass excess, binding per nucleon and abundance, with the ENSDF and XUNDL datasets, NSR papers and EXFOR entries held for each. Sorts on every column; a row opens its nuclide on the chart.", lines: ["Rows: Ground States", "Columns: Properties and Counts", "Source: IAEA Live Chart, ENSDF, XUNDL, NSR, EXFOR"] },
]

/** The sidebar's other pages, each with a box on the contents plate (brief 46): its name and what it is for. Not charts,
 *  like the tables. The five dataset pages have no sidebar row of their own. */
export type PlatePage = { href: string; name: string; body: string }
export const PLATE_PAGES: PlatePage[] = [
  { href: "/about", name: "About", body: "Who I am for, what I hold, what I do, and how I am built." },
  { href: "/chat", name: "Chat", body: "Ask about nuclear data and the papers behind it." },
  { href: "/data-dictionary", name: "Data dictionary", body: "Every field the API returns or a page shows, by dataset." },
  { href: "/docs", name: "Docs", body: "How to use NSRgpt: where to start, the topics and the video guides." },
  { href: "/factory", name: "Factory", body: "How the data moves from its sources through the lake to the pages." },
  { href: "/glossary", name: "Glossary", body: "Every nuclear data term the app uses, defined." },
  { href: "/graph", name: "Graph", body: "Diagrams of the decay series, process chains and production routes, each one editable." },
  { href: "/nsrcpt", name: "NSR-CPT", body: "The retrieval model trained on 277,068 nuclear-physics references, with its benchmark." },
  { href: "/pipeline", name: "Pipeline", body: "Where the data comes from, where it is kept, and what reads it." },
  { href: "/schema", name: "Schema", body: "The tables the API reads, the tables they are built from, and the keys between them." },
  { href: "/search", name: "Search", body: "Find NSR papers by meaning or by keyword." },
  { href: "/sweep", name: "Sweep", body: "Every measured cross section against every evaluation, ranked by disagreement." },
  { href: "/datasets/endf", name: "ENDF/B", body: "Evaluated nuclear data files, every ENDF/B release, by material." },
  { href: "/datasets/ensdf", name: "ENSDF", body: "Evaluated nuclear structure datasets, by nuclide or mass." },
  { href: "/datasets/exfor", name: "EXFOR", body: "Experimental nuclear reaction data, by target and reaction." },
  { href: "/datasets/nsr", name: "NSR", body: "Nuclear Science References, by key or author." },
  { href: "/datasets/xundl", name: "XUNDL", body: "Unevaluated nuclear structure datasets, by nuclide or mass." },
]

/** The chart before and after `path` in box order, wrapping at the ends; null off the list. */
export function vizNeighbours(path: string | null): { prev: VizChart; next: VizChart } | null {
  const i = VIZ_CHARTS.findIndex((c) => c.href === path)
  if (i < 0) return null
  const n = VIZ_CHARTS.length
  return { prev: VIZ_CHARTS[(i - 1 + n) % n], next: VIZ_CHARTS[(i + 1) % n] }
}
