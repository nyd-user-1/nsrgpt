import { HEADER_TITLES } from "@/lib/header-titles"
import { VIZ_CHARTS } from "@/lib/viz-charts"
import { shot, video } from "./media"
import { doc, type Doc } from "./types"

// The chart atlas (2026-11-07): every chart, grouped by the physics it shows. Each chart's section is built from
// lib/viz-charts.ts and lib/header-titles.ts, the same entries the index's boxes and the header read, so the atlas
// can't drift from the charts.

// Charts whose section runs without a screenshot (2026-11-07): the decay heat chart needs WebGPU, which the capture
// browser lacks, and the capture-γ spectra repeat the γ-ray lines' picture.
const NO_SHOT = new Set(["particles", "spectra"])

function section(href: string): string {
  const c = VIZ_CHARTS.find((x) => x.href === href)
  if (!c) return ""
  const slug = href.split("/").pop()!
  const name = HEADER_TITLES[href] ?? c.title
  const rows = c.lines.map((l) => {
    const i = l.indexOf(":")
    return `| ${l.slice(0, i)} | ${l.slice(i + 1).trim()} |`
  })
  return `## ${name}

${NO_SHOT.has(slug) ? "" : `${shot(`chart-${slug}`, `${name}: ${c.title}`)}\n\n`}${c.body}

| | |
|---|---|
| Chart type | ${c.title} |
${rows.join("\n")}

[Open ${name}](${href})`
}

const page = (slug: string, title: string, summary: string, tags: string[], intro: string, hrefs: string[], extra = ""): Doc => ({
  slug,
  title,
  category: "atlas",
  summary,
  tags: ["Charts", ...tags],
  body: [intro, ...hrefs.map(section), extra].filter(Boolean).join("\n\n"),
})

export const ATLAS: Doc[] = [
  page(
    "atlas-masses",
    "Masses and binding",
    "Binding energy per nucleon, the binding surface and neutron separation energies, from AME2020.",
    ["AME2020"],
    `How tightly a nucleus holds together, from the 2020 Atomic Mass Evaluation. Binding energy per nucleon peaks near iron and nickel: lighter nuclei release energy by fusing, heavier ones by splitting.`,
    ["/viz/nebula", "/viz/surface", "/viz/separation"],
  ),
  page(
    "atlas-decay",
    "Decay",
    "Decay modes, half-lives, the decay network and the simulations that run it.",
    ["ENSDF", "Decay"],
    `How each ground state decays, how fast, and where its decay leads. The half-lives and modes are ENSDF's; the chains are solved exactly with the Bateman equations.`,
    ["/viz/rainfall", "/viz/bar-large", "/viz/heatmap", "/viz/graph", "/viz/reactions", "/viz/decay", "/viz/decay2", "/viz/decay-chain", "/viz/particles"],
    `## Watch them run

${video("record-decay", "The decay simulation: every ground state decaying at its measured rate")}

${video("record-reactions", "Decay paths: every decay step as a route, lit from one nuclide")}`,
  ),
  page(
    "atlas-radiation",
    "Decay radiation and γ rays",
    "Every line a nuclide's decay gives off, and a finder for γ peaks.",
    ["ENSDF", "IAEA Live Chart"],
    `What a decay emits: α particles, β spectra, γ rays, X-rays and electrons, each with its energy and its intensity per 100 decays. ENSDF's decay radiation, through the IAEA Live Chart.`,
    ["/viz/radiation", "/viz/gamma-lines"],
    `> Have a peak in a spectrum and no name for it? [Decay γ-Ray Energies](/viz/gamma-lines) lists the emitters inside a window around any energy, strongest first.`,
  ),
  page(
    "atlas-structure",
    "Nuclear structure",
    "Levels, first 2⁺ energies, transition strengths and each nuclide's profile.",
    ["ENSDF", "Structure"],
    `The excited states of nuclei: where the levels sit, how strongly the first 2⁺ state is collective, and how those measures change across the chart. Magic numbers show as breaks in every one of them.`,
    ["/viz/weight", "/viz/scatter3d", "/viz/first-excited", "/viz/levels", "/viz/level-spans", "/viz/level-candles", "/viz/nuclide-card", "/viz/isotope-radar"],
    `## Watch it run

${video("record-levels", "Level energies in 3D: 139,868 adopted levels, and one nuclide's transitions")}`,
  ),
  page(
    "atlas-capture",
    "Neutron capture",
    "Thermal-capture γ lines and spectra, from CapGam.",
    ["CapGam"],
    `What a nucleus gives off when it captures a slow neutron: 78,746 γ lines over 260 product nuclei in NNDC's CapGam.`,
    ["/viz/simplex", "/viz/spectra", "/viz/gamma-atlas", "/viz/gamma-punchcard"],
  ),
  page(
    "atlas-reactions",
    "Reactions and fission",
    "EXFOR cross sections, fission yields and every ground-state property on any axis.",
    ["EXFOR", "JEFF-3.1.1", "IAEA Live Chart"],
    `Measured reactions and their products: EXFOR's cross sections, JEFF-3.1.1's fission yields, and the IAEA Live Chart's ground-state properties to plot against each other.`,
    ["/viz/scatter3d-dataset", "/viz/fission-yields", "/viz/explorer"],
  ),
  page(
    "atlas-literature",
    "Literature and evaluation",
    "How much has been written about each nuclide, how recently it was evaluated, and how its properties move together.",
    ["NSR", "ENSDF"],
    `Where the knowledge stands: the papers in the Nuclear Science References, the age of each ENSDF evaluation, and the correlations across nine measured properties.`,
    ["/viz/literature", "/viz/knowledge", "/viz/matrix"],
    `> Every chart's rows are a table too. See [Data Tables](${doc("data-tables")}).`,
  ),
]
