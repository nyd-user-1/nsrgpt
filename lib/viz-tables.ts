// The twelve /viz charts by slug (2026-11-04): each chart's name, now that the chart pages are bare, for
// its data table's page (/viz/data/<slug>) — a click on any chart opens that table in the second panel.
// The rows themselves load in the browser from the committed snapshot (components/viz/DataTable.tsx).

import { HEADER_TITLES } from "@/lib/header-titles"

// `chart` (brief 36, 2026-11-09): the chart whose table it is, when its slug differs from the table's (the decay series
// steps belong to /viz/reactions), or null for a table no chart opens (nuclides, reactions). The sidebar and search name
// a chart's table by its chart.
export const VIZ_TABLES: Record<string, { title: string; chart?: string | null }> = {
  "bar-large": { title: "Half-lives, longest first" },
  graph: { title: "Decay links" },
  heatmap: { title: "Half-lives by N and Z" },
  matrix: { title: "Correlations across nine nuclide measures" },
  nebula: { title: "Binding energy per nucleon" },
  "nuclide-card": { title: "Nuclide properties" },
  "isotope-radar": { title: "Nuclide properties" },
  literature: { title: "Papers per nuclide" },
  rainfall: { title: "Nuclides per mass number, by decay mode" },
  // Decay steps, not reactions (brief 36): /viz/reactions' table, renamed from /viz/data/reactions.
  "decay-steps": { title: "Decay series steps", chart: "reactions" },
  // Every EXFOR target, reaction and quantity (brief 36): no chart opens it.
  reactions: { title: "Reactions", chart: null },
  separation: { title: "Neutron separation energies" },
  "scatter3d-dataset": { title: "EXFOR measurements" },
  scatter3d: { title: "E(2⁺), B(E2) and Z" },
  simplex: { title: "Capture γ lines" },
  spectra: { title: "Capture γ lines" },
  "gamma-atlas": { title: "Capture γ atlas" },
  "gamma-punchcard": { title: "Capture γ by element" },
  decay2: { title: "Ground-state decays" },
  surface: { title: "Binding energy per nucleon" },
  weight: { title: "E(2⁺) and B(E2), even-even nuclides" },
  "first-excited": { title: "First 2⁺ energies, even-even nuclides" },
  "level-spans": { title: "Level spans per nuclide" },
  "level-candles": { title: "Level energies per nuclide" },
  // Not a chart's table: every ground state with its properties and the counts held for it (brief 35).
  nuclides: { title: "Nuclides", chart: null },
}


/** The table a chart's click opens: /viz/<slug> → /viz/data/<tableOf(slug)>. */
export function tableOf(chartSlug: string): string {
  const own = Object.entries(VIZ_TABLES).find(([, t]) => t.chart === chartSlug)
  return own ? own[0] : chartSlug
}

/** A table's name in the sidebar and search: its chart's header name, or its own title when no chart opens it. */
export function tableName(slug: string): string {
  const t = VIZ_TABLES[slug]
  const chart = t?.chart === undefined ? slug : t.chart
  return (chart && HEADER_TITLES[`/viz/${chart}`]) || t?.title || slug
}
