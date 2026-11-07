import { shot } from "./media"
import { doc, type Doc } from "./types"

export const SOURCES: Doc[] = [
  {
    slug: "sources-overview",
    title: "Sources",
    category: "sources",
    summary: "Every database I draw from, what it holds and how much of it I have.",
    tags: ["Data", "Sources"],
    body: `Every number on a chart comes from one of these. I build each chart's file from a snapshot of its source, so a page never waits on another server.

${shot("chart-heatmap", "Half-Lives on the Chart of Nuclides, from ENSDF")}

## The databases

| Source | Who keeps it | What it holds | How much |
|---|---|---|---|
| NSR | NNDC | Nuclear Science References: papers, and the nuclides each covers | 303,568 references · 1,210,113 nuclide links |
| ENSDF | NNDC | Evaluated nuclear structure and decay data | 20,120 datasets · 3,276,986 records |
| XUNDL | NNDC | Structure data as published, before evaluation | 12,072 datasets · 931,258 records |
| EXFOR | IAEA | Measured nuclear reaction data | 27,070 entries · 4,344,595 cross sections |
| AME2020 | IAEA AMDC | Atomic masses | 3,558 nuclides |
| NUBASE2020 | IAEA AMDC | Ground-state and isomer properties | |
| CapGam | NNDC | Thermal neutron capture γ rays | 78,746 lines · 260 nuclei |
| JEFF-3.1.1 | OECD NEA | Fission product yields | 8 fissioning nuclides |
| IAEA Live Chart | IAEA | Ground states, decay radiation and fission yields, through its API | 3,386 nuclides |

## More on each

- [Nuclear Science References](${doc("nsr")})
- [ENSDF and XUNDL](${doc("ensdf-xundl")})
- [EXFOR](${doc("exfor")})
- [AME2020 and NUBASE2020](${doc("masses")})
- [The IAEA Live Chart](${doc("livechart")})
- [How the data is built](${doc("how-data-is-built")})`,
  },
  {
    slug: "nsr",
    title: "Nuclear Science References",
    category: "sources",
    summary: "The bibliography of nuclear physics, and the nuclides each paper covers.",
    tags: ["Sources", "NSR"],
    body: `The Nuclear Science References is NNDC's bibliography of nuclear physics: 303,568 references, each indexed by the nuclides, reactions and measurements it covers.

## What I draw from it

- [NSR Papers per Nuclide](/viz/literature): all 7,799 nuclides the literature touches, sized by papers.
- [ENSDF Evaluation Coverage](/viz/knowledge): the nuclides studied in the literature but never evaluated.

## The counts

| | |
|---|---|
| References | 303,568 |
| Links between a paper and a nuclide | 1,210,113 |
| Nuclides the literature touches | 7,799 |`,
  },
  {
    slug: "ensdf-xundl",
    title: "ENSDF and XUNDL",
    category: "sources",
    summary: "Evaluated structure and decay data, and the unevaluated data that comes before it.",
    tags: ["Sources", "ENSDF", "XUNDL"],
    body: `ENSDF, the Evaluated Nuclear Structure Data File, is NNDC's evaluated record of every nucleus's levels, transitions and decays. XUNDL holds the same kind of data as each paper published it, before an evaluator has combined it.

## ENSDF

| | |
|---|---|
| Datasets | 20,120 |
| Records (80-column cards) | 3,276,986 |
| Ground states with a half-life | 3,420 |
| Adopted levels | 139,868 |

Most charts read ENSDF: half-lives, decay modes, levels, γ transitions, first 2⁺ energies and the decay network.

## XUNDL

| | |
|---|---|
| Datasets | 12,072 |
| Records | 931,258 |
| Nuclides | 2,979 |
| NSR links | 20,917 |

> XUNDL is held but not yet drawn. A chart of it is coming.`,
  },
  {
    slug: "exfor",
    title: "EXFOR",
    category: "sources",
    summary: "The world's measured nuclear reaction data, kept by the IAEA.",
    tags: ["Sources", "EXFOR"],
    body: `EXFOR is the IAEA's library of measured reaction data. An entry is one experiment's work, usually one paper; a subentry is one measured quantity; a data point is one value at one energy.

| | |
|---|---|
| Entries | 27,070 |
| Subentries | 200,465 |
| Cross sections (data points) | 4,344,595 |

The cross sections are each one reaction's value, in barns, at one incident energy, from the IAEA's exfor_json export.

## What I draw from it

[EXFOR Cross Sections](/viz/scatter3d-dataset): 50,000 measurements sampled from the 4.3 million, by energy, year and cross section.`,
  },
  {
    slug: "masses",
    title: "AME2020 and NUBASE2020",
    category: "sources",
    summary: "Atomic masses, and the ground-state properties evaluated with them.",
    tags: ["Sources", "AME2020"],
    body: `The 2020 Atomic Mass Evaluation gives every measured and extrapolated atomic mass, and from them binding energies, Q-values and separation energies. NUBASE2020 is its companion: half-lives, spins and isomers.

## What I draw from them

- [Binding Energy per Nucleon](/viz/nebula) and [Binding Energy Surface](/viz/surface).
- [Neutron Separation Energies](/viz/separation).
- The Q-values behind [Nuclide Decay Heat](/viz/particles).

> A mass AME extrapolates rather than measures carries a # in its table.`,
  },
  {
    slug: "livechart",
    title: "The IAEA Live Chart",
    category: "sources",
    summary: "Ground states, decay radiation and fission yields, pulled from the IAEA's API.",
    tags: ["Sources", "IAEA"],
    body: `The IAEA's Live Chart of Nuclides serves ENSDF, NUBASE and JEFF data through an open API. I pulled it in full on 2026-11-06: 17,670 requests, every one answered.

## What I draw from it

- [Ground-State Properties](/viz/explorer): any property on any axis, for 3,386 nuclides.
- [Fission Product Yields](/viz/fission-yields): JEFF-3.1.1 for eight fissioning nuclides.
- [Nuclide Decay Radiation](/viz/radiation) and [Decay γ-Ray Energies](/viz/gamma-lines).
- The chart types a metric can switch between. See [Switch chart type](${doc("chart-types")}).`,
  },
  {
    slug: "how-data-is-built",
    title: "How the data is built",
    category: "sources",
    summary: "From a source's snapshot to the file a chart reads.",
    tags: ["Sources"],
    body: `## Snapshots, then files

Each source is pulled once, as served, and kept unchanged. A build script turns it into the file a chart reads: one JSON file per dataset, holding only what the charts draw.

1. **Pull.** The source as its publisher serves it, kept in storage with a manifest.
2. **Build.** A script reads the pull and writes the chart's file.
3. **Serve.** The site serves the files as they are. No page calls an outside source when you open it.

## Why it's built this way

- A chart opens at the speed of a file, not of someone else's server.
- The numbers you see are the numbers in the snapshot, and a table shows the same rows.
- A new pull is one build, and every chart that reads it updates together.

> Placeholder: the pull and build dates for each source, and the scripts that make each file, will be listed here.`,
  },
]
