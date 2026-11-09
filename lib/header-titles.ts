/** A page's name in AppLayout's header, by path (2026-11-04). For the charts, the physics name of what they show
 *  (Brendan, 2026-11-06); the chart type is lib/viz-charts.ts's title, shown at each panel's bottom left. AppLayout now lives in app/(site)/layout.tsx and
 *  mounts once, so it reads the title from the path instead of each chart page passing it in. */
export const HEADER_TITLES: Record<string, string> = {
  "/viz/bar-large": "Ground-State Half-Lives",
  "/viz/graph": "Nuclide Decay Network",
  "/viz/heatmap": "Half-Lives on the Chart of Nuclides",
  "/viz/matrix": "Nuclear Property Correlations",
  "/viz/nebula": "Binding Energy per Nucleon",
  "/viz/nuclide-card": "Nuclide Property Profile",
  "/viz/rainfall": "Decay Modes by Mass Number",
  "/viz/reactions": "Nuclide Decay Paths",
  "/viz/separation": "Neutron Separation Energies",
  "/viz/scatter3d-dataset": "EXFOR Cross Sections",
  "/viz/scatter3d": "First 2⁺ Energy, B(E2) and Z",
  "/viz/simplex": "Capture γ-Ray Lines",
  "/viz/spectra": "Thermal Neutron Capture γ Spectra",
  "/viz/gamma-atlas": "Capture γ Intensity by Mass Number",
  "/viz/gamma-punchcard": "Capture γ Intensity by Element",
  "/viz/surface": "Binding Energy Surface",
  "/viz/weight": "First 2⁺ Energy and B(E2)",
  "/viz/decay": "Radioactive Decay Simulation",
  "/viz/decay2": "Decay Populations Over Time",
  "/viz/decay-chain": "Decay Chain Activity",
  "/viz/chart": "Chart of Nuclides",
  "/viz/particles": "Nuclide Decay Heat",
  "/viz/fission-yields": "Fission Product Yields",
  "/viz/explorer": "Ground-State Properties",
  "/viz/radiation": "Nuclide Decay Radiation",
  "/viz/gamma-lines": "Decay γ Lines",
  "/viz/knowledge": "ENSDF Evaluation Coverage",
  "/viz/levels": "Adopted Level Energies",
  "/viz/first-excited": "First 2⁺ Excitation Energies",
  "/viz/level-spans": "Level Spans Along an Isotope Chain",
  "/viz/level-candles": "Level Energy Distributions",
  "/viz/isotope-radar": "Isotope Property Profiles",
  "/viz/literature": "NSR Papers per Nuclide",
  "/viz/structure": "ENSDF Evaluation Cutoffs",
  // The help center (2026-11-07); every /docs/<slug> article wears it too (AppLayout).
  "/docs": "Docs",
  // The old nsr app's search and workspace canvas, ported by merge-agent (2026-11-07).
  "/search": "Search",
  "/graph": "Graph",
  // pax2's production map, ported as NSRgpt's sources, lake and roadmap (2026-11-07).
  "/pipeline": "Pipeline",
  // Brief 32 (2026-11-08): pax's factory and schema canvases, pax2's glossary, and our own data dictionary. Working routes;
  // Brendan names them later, so each is one entry here and one row in the sidebar.
  "/data-dictionary": "Data dictionary",
  "/factory": "Factory",
  "/glossary": "Glossary",
  "/schema": "Schema",
  // The five parsed datasets, index and records (brief 33).
  "/datasets/endf": "ENDF/B",
  "/datasets/ensdf": "ENSDF",
  "/datasets/exfor": "EXFOR",
  "/datasets/nsr": "NSR",
  "/datasets/xundl": "XUNDL",
}
