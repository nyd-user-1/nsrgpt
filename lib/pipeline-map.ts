// /pipeline's content (2026-11-07, trimmed by Brendan 2026-11-08): the sources on the left, the NSR Lake and its
// core datasets in the middle (each dataset with the keys that join it to the others), and what reads the lake on
// the right, built or coming soon. Counts are the lake's own (INVENTORY.md, docs/briefs/19-morning-report.md).

export type Status = "held" | "partly" | "toget" | "blocked"
export type Leaf = { name: string; status: Status; pill?: string }
export type Fold = { label: string; items: Leaf[] }
export type Source = { id: string; title: string; folds: Fold[] }

const held = (name: string, pill?: string): Leaf => ({ name, status: "held", pill })
const toget = (name: string, pill?: string): Leaf => ({ name, status: "toget", pill })
const partly = (name: string, pill?: string): Leaf => ({ name, status: "partly", pill })
const blocked = (name: string, pill?: string): Leaf => ({ name, status: "blocked", pill })

export const SOURCES: Source[] = [
  {
    id: "nndc",
    title: "BNL · NNDC",
    folds: [
      { label: "Datasets", items: [held("NSR", "303,568"), held("ENSDF", "20,117"), held("XUNDL", "12,547"), held("ENDF/B-II to B-VIII.1", "22,315"), held("CapGam", "287"), held("B(E2)", "4,180"), held("Double-beta decay", "838"), held("Wallet Cards", "4,119"), held("NuDat 3 chart", "3,614"), held("MACS"), held("Low-fidelity covariances", "387"), blocked("ENDF/B-I", "no copy")] },
      { label: "Formats", items: [held("ENSDF, 80 columns"), held("ENDF-6"), held("GNDS"), held("ACE"), held("NSR exchange and JSON")] },
      { label: "Frameworks", items: [held("USNDP", "54 reports"), held("CSEWG", "documents"), held("NSDD network")] },
    ],
  },
  {
    id: "iaea",
    title: "IAEA",
    folds: [
      { label: "Datasets", items: [held("EXFOR", "27,116"), held("Live Chart", "360,475 rows"), held("ENDF archive libraries", "51 GB"), held("FENDL-3.2, IRDFF-II, PD-2019"), held("CD-ROM packages", "50 of 60"), held("IBANDL"), held("RIPL-3, RIPL-4"), held("Standards, INDL/TSL"), held("CINDA, CIELO, IDB, PSF, CoNDERC, NGATLAS"), held("TENDL-2023, 2021"), partly("Records repository", "arriving"), toget("DXS, phases 3 and 4")] },
      { label: "Formats", items: [held("EXFOR X4, C4, CX4, J4"), held("EXFOR C5, x5json"), held("X4Pro (SQLite)"), held("ENDF-6"), held("ACE, GENDF, MATXS (FENDL)")] },
      { label: "Codes", items: [held("endf-parserpy, exforparser, ndlab", "Python"), held("PREPRO, ACEMAKER", "Fortran"), held("EMPIRE, TALYS", "Fortran"), held("GANDR, GRUCON, DICEBOX"), held("ENSDF programs", "31 NSDD repos")] },
      { label: "Frameworks", items: [held("NRDC network (EXFOR)"), held("NSDD network (ENSDF)")] },
    ],
  },
  {
    id: "nea",
    title: "OECD NEA",
    folds: [
      { label: "Datasets", items: [held("JEFF-3.1", "Sigma"), held("JEFF-3.3, JEFF-4.0", "IAEA copies"), held("JEFF-3.2, 3.1.2, 3.1.1, 3.1, 3.0", "Internet Archive"), held("JEFF-3.3 charged particles"), held("JEFF-3.1.2, 3.2 ACE sets", "293 to 1800 K")] },
      { label: "Frameworks", items: [toget("WPEC"), toget("GNDS specification")] },
    ],
  },
  {
    id: "jaea",
    title: "JAEA",
    folds: [{ label: "Datasets", items: [held("JENDL-3.3, JENDL-4.0", "Sigma"), held("JENDL-5", "sublibraries and updates"), held("JENDL special files", "PD-2016, AD-2017, HE, DEU-2020, FPY, decay"), blocked("JENDL-PD2016.1", "dead link")] }],
  },
  {
    id: "others",
    title: "IPPE · CNDC · PSI",
    folds: [
      { label: "Datasets", items: [held("ROSFOND, ROSFOND-2010", "Russia"), held("BROND-3.1", "Russia"), held("CENDL-3.1, CENDL-3.2", "China"), held("TENDL-2019, 2021, 2023")] },
      { label: "Codes", items: [held("TALYS 1.6–1.9", "Fortran")] },
    ],
  },
  {
    id: "lanl",
    title: "LANL · NJOY · OpenMC",
    folds: [
      { label: "Codes", items: [held("ENDFtk", "C++, Python"), held("NJOY2016, NJOY21", "Fortran, C++"), held("fudge (LLNL), endf-python", "Python")] },
      { label: "Formats", items: [held("OpenMC HDF5 libraries", "47.5 GB")] },
    ],
  },
  {
    id: "lit",
    title: "arXiv · APS · S2",
    folds: [{ label: "Datasets", items: [held("arXiv and APS references", "48,253"), held("Paper PDFs", "37,417"), held("Abstracts and citations")] }],
  },
]

export type Core = { id: string; name: string; what: string; record: string; count: string; keys: string; inside: [string, string][]; links: [string, string][] }

export const CORE: Core[] = [
  {
    id: "nsr",
    name: "NSR",
    what: "Bibliography of nuclear science papers, 1857 to now",
    record: "references",
    count: "303,568",
    keys: "key number, e.g. 2011CH57",
    inside: [["Authors", "1,404,442"], ["Subjects", "686,880"], ["Reactions", "229,143"], ["Topics", "214,376"]],
    links: [["ENSDF", "198,295 stored links"], ["XUNDL", "20,917 stored links"], ["EXFOR", "23,515 stored links"], ["Nuclide", "1,210,113 stored links"]],
  },
  {
    id: "ensdf",
    name: "ENSDF",
    what: "Evaluated nuclear structure and decay data",
    record: "datasets",
    count: "20,117",
    keys: "NUCID + DSID",
    inside: [["Levels", "568,228"], ["Gammas", "793,431"], ["Other records", "129,399"]],
    links: [["NSR", "key number"], ["Nuclide", "NUCID (Z, A)"], ["ENDF/B", "decay sublibrary built from ENSDF"]],
  },
  {
    id: "xundl",
    name: "XUNDL",
    what: "Experimental structure data not yet evaluated; feeds ENSDF",
    record: "datasets",
    count: "12,547",
    keys: "NUCID",
    inside: [["Levels", "194,604"], ["Gammas", "257,154"]],
    links: [["NSR", "key number"], ["Nuclide", "NUCID (Z, A)"]],
  },
  {
    id: "exfor",
    name: "EXFOR",
    what: "Experimental nuclear reaction measurements",
    record: "entries",
    count: "27,116",
    keys: "entry number, e.g. 10001",
    inside: [["Subentries", "223,615"], ["Measured data rows", "19,439,354"], ["Reaction codes", "88,813"]],
    links: [["NSR", "key number ↔ entry"], ["Nuclide", "target in the reaction code"], ["ENDF/B", "same target and reaction: measured vs evaluated"]],
  },
  {
    id: "endf",
    name: "ENDF/B",
    what: "Evaluated nuclear reaction libraries, B-II to B-VIII.1",
    record: "materials",
    count: "22,315",
    keys: "MAT, e.g. 9228 (U-235)",
    inside: [["Materials in B-VIII.1", "5,135"], ["Cross-section points", "9,127,277"]],
    links: [["Nuclide", "MAT ↔ ZA"], ["EXFOR", "measured vs evaluated"], ["ENSDF", "decay data"]],
  },
]

export const NUCLIDE = { name: "Nuclide", count: "10,043", keys: "Z, A" }
export const LAKE = { size: "430.7 GB", files: "118K", records: "~35M" }

export type Surface = { id: string; title: string; soon?: boolean; rows: [string, string][]; href?: string; open?: string }

export const SURFACES: Surface[] = [
  { id: "chat", title: "Chat", href: "/chat", open: "Open Chat", rows: [["Models", "Bedrock"], ["Reads", "NSR, ENSDF, XUNDL, EXFOR entries"], ["Sources list", "nsr-search Lambda"]] },
  { id: "search", title: "Search", href: "/search", open: "Open Search", rows: [["Encoder", "NSR-CPT"], ["Records", "675,427 across the lake"], ["Warm", "0.25–0.5 s"]] },
  { id: "graph", title: "Graph", href: "/graph", open: "Open Graph", rows: [["Expand a node", "Athena, 2–5 s"], ["Similar papers", "nsr-search Lambda"], ["Decay chains", "ENSDF"]] },
  { id: "charts", title: "Charts", href: "/", open: "Open the charts", rows: [["ENSDF", "levels, decays"], ["IAEA Live Chart", "radiation, fission yields"], ["EXFOR", "50,000-point sample"], ["Chart of nuclides", "every nuclide, its card"]] },
  { id: "endf", title: "ENDF/B", soon: true, rows: [["Materials", "22,315"], ["Cross-section points", "9,127,277"], ["API", "/endf/xs, live"]] },
  { id: "exfor", title: "EXFOR", soon: true, rows: [["Data rows", "19,439,354"], ["In the app now", "27,070 entry descriptions"], ["API", "/exfor/search, live"]] },
  { id: "cite", title: "Answers Traced", soon: true, rows: [["Cites", "record, dataset or data point"]] },
  { id: "saved", title: "Saved chats", soon: true, rows: [["Store", "not created yet"]] },
  { id: "eval", title: "Evaluator workflows", soon: true, rows: [["New papers", "per nuclide"], ["Gaps", "missing evaluations"], ["Measured vs evaluated", "EXFOR against ENDF"]] },
]
