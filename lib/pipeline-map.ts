// /pipeline's content (2026-11-07): the sources on the left, the NSR lake and its core datasets in the middle (the
// ERD: each dataset with the keys that join it to the others), and what reads the lake on the right, built and
// planned (the roadmap). Counts are the lake's own, from docs/sketches/2026-11-07-data-index.html.

export type Status = "held" | "partly" | "toget" | "blocked"
export type Leaf = { name: string; status: Status; pill?: string }
export type Fold = { label: string; items: Leaf[] }
export type Source = { id: string; title: string; count: string; planned?: boolean; edge: string; folds: Fold[]; note?: string }

const held = (name: string, pill?: string): Leaf => ({ name, status: "held", pill })
const toget = (name: string, pill?: string): Leaf => ({ name, status: "toget", pill })
const partly = (name: string, pill?: string): Leaf => ({ name, status: "partly", pill })
const blocked = (name: string, pill?: string): Leaf => ({ name, status: "blocked", pill })

export const SOURCES: Source[] = [
  {
    id: "nndc",
    title: "BNL · NNDC",
    count: "Held",
    edge: "raw/nndc/2026-11-07/",
    folds: [
      { label: "Datasets", items: [held("NSR", "303,568"), held("ENSDF", "20,117"), held("XUNDL", "12,547"), held("ENDF/B-II to B-VIII.1", "22,315"), held("CapGam", "287"), held("B(E2)", "4,180"), held("Double-beta decay", "838"), held("Wallet Cards", "4,119"), held("NuDat 3 chart", "3,614"), held("MACS"), held("Low-fidelity covariances", "387"), blocked("ENDF/B-I", "no copy")] },
      { label: "Formats", items: [held("ENSDF, 80 columns"), held("ENDF-6"), held("GNDS"), held("ACE"), held("NSR exchange and JSON")] },
      { label: "Frameworks", items: [held("USNDP", "54 reports"), held("CSEWG", "documents"), held("NSDD network")] },
    ],
  },
  {
    id: "iaea",
    title: "IAEA · Nuclear Data Section",
    count: "Partly",
    edge: "raw/iaea/, raw/github/IAEA-NDS/",
    folds: [
      { label: "Datasets", items: [held("EXFOR", "27,116"), held("Live Chart", "360,475 rows"), held("ENDF archive libraries", "70 GB"), held("FENDL-3.2, IRDFF-II, PD-2019"), held("CD-ROM packages", "50 of 60"), held("IBANDL"), held("RIPL-3, RIPL-4"), held("Standards, INDL/TSL"), partly("CINDA", "2014 copy; files pending"), partly("Quick Links (75)", "56 in the lake, 15 arriving"), toget("Pending addresses", "11,289")] },
      { label: "Formats", items: [held("EXFOR X4, C4, CX4, J4"), held("EXFOR C5, x5json"), held("X4Pro (SQLite)"), held("ENDF-6"), held("ACE, GENDF, MATXS (FENDL)")] },
      { label: "Codes", items: [held("endf-parserpy, exforparser, ndlab", "Python"), held("PREPRO, ACEMAKER", "Fortran"), held("EMPIRE, TALYS", "Fortran"), held("GANDR, GRUCON, DICEBOX"), held("ENSDF programs", "31 NSDD repos")] },
      { label: "Frameworks", items: [held("NRDC network (EXFOR)"), held("NSDD network (ENSDF)")] },
    ],
    note: "nds.iaea.org answers scripts with a bot check; real Chrome on an AWS box, through the proxy army, got past it on 2026-11-07.",
  },
  {
    id: "nea",
    title: "OECD NEA",
    count: "Partly",
    edge: "raw/nea/, raw/iaea/, raw/nndc-sigma/",
    folds: [
      { label: "Datasets", items: [held("JEFF-3.1", "Sigma"), held("JEFF-3.3, JEFF-4.0", "IAEA copies"), held("JEFF-3.2, 3.1.2, 3.1.1", "Internet Archive"), partly("JEFF-3.3 charged particles", "arriving")] },
      { label: "Frameworks", items: [toget("WPEC"), toget("GNDS specification")] },
    ],
  },
  {
    id: "jaea",
    title: "JAEA",
    count: "Partly",
    edge: "raw/jaea/, raw/iaea/, raw/nndc-sigma/",
    folds: [{ label: "Datasets", items: [held("JENDL-3.3, JENDL-4.0", "Sigma"), held("JENDL-5", "IAEA copy, 7.6 GB"), partly("JENDL special files", "arriving")] }],
  },
  {
    id: "others",
    title: "IPPE · CNDC · PSI",
    count: "Partly",
    edge: "raw/iaea/, raw/nndc-sigma/",
    folds: [
      { label: "Datasets", items: [held("ROSFOND, ROSFOND-2010", "Russia"), held("BROND-3.1", "Russia"), held("CENDL-3.1, CENDL-3.2", "China"), held("TENDL-2019 subsite", "3.2 GB"), partly("TENDL-2023, 2021", "arriving")] },
      { label: "Codes", items: [held("TALYS 1.6–1.9", "Fortran")] },
    ],
  },
  {
    id: "lanl",
    title: "LANL · NJOY · OpenMC",
    count: "Held",
    edge: "raw/github/, raw/openmc/",
    folds: [
      { label: "Codes", items: [held("ENDFtk", "C++, Python"), held("NJOY2016, NJOY21", "Fortran, C++"), held("fudge (LLNL), endf-python", "Python")] },
      { label: "Formats", items: [held("OpenMC HDF5 libraries", "47.5 GB")] },
    ],
  },
  {
    id: "lit",
    title: "arXiv · APS · Semantic Scholar",
    count: "Held",
    edge: "lake/nsr-database/, files/pdfs/",
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
    inside: [["Author links", "1,404,442"], ["Subject links", "686,880"], ["Reaction links", "229,143"], ["Topic links", "214,376"]],
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

export const NUCLIDE = { name: "Nuclide", count: "10,043", keys: "Z, A (nuclide_dict)" }
export const LAKE = { bucket: "s3://nsr-lake-613473203863", size: "277.1 GB", files: "73,926", records: "about 35 million in the core five", asOf: "the evening of 2026-11-07" }

export type Surface = { id: string; title: string; count: string; planned?: boolean; edge: string; rows: [string, string][]; href?: string; open?: string; note?: string }

export const SURFACES: Surface[] = [
  { id: "chat", title: "Chat", count: "Live", edge: "Athena: nsr, ensdf, xundl, exfor", href: "/chat", open: "Open Chat", rows: [["Models", "Bedrock"], ["Reads", "NSR, ENSDF, XUNDL, EXFOR entries"], ["Sources list", "nsr-search Lambda"]] },
  { id: "search", title: "Search", count: "Live", edge: "work/search/v1/", href: "/search", open: "Open Search", rows: [["Encoder", "NSR-CPT"], ["Warm", "0.25–0.5 s"], ["Wake", "about 22 s"]] },
  { id: "graph", title: "Graph", count: "Live", edge: "Athena, nsr-search", href: "/graph", open: "Open Graph", rows: [["Expand a node", "Athena, 2–5 s"], ["Similar papers", "nsr-search Lambda"]] },
  { id: "charts", title: "Charts", count: "32", edge: "public/viz-data/", href: "/", open: "Open the charts", rows: [["ENSDF", "levels, decays"], ["IAEA Live Chart", "radiation, fission yields"], ["EXFOR", "50,000-point sample"], ["CapGam, AME2020", "capture gammas, masses"]] },
  { id: "endf", title: "ENDF/B in the app", count: "Planned", planned: true, edge: "raw/nndc/…/endf-releases/", rows: [["Materials", "22,315"], ["Cross-section points", "9,127,277"]], note: "Parse every library into tables; chat reads them; charts plot measured against evaluated." },
  { id: "exfor", title: "EXFOR measured data", count: "Planned", planned: true, edge: "raw/github/…/EXFOR-JSON-File/", rows: [["Data rows", "19,439,354"], ["In the app now", "27,070 entry descriptions"]], note: "Every data row into tables, joined to NSR and the nuclide." },
  { id: "cite", title: "Answers cite their record", count: "Planned", planned: true, edge: "every table", rows: [["Cites", "record, dataset or data point"]], note: "Every answer traced to the reference, dataset or data point it rests on." },
  { id: "saved", title: "Saved chats", count: "Planned", planned: true, edge: "DynamoDB nysgpt-ledger", rows: [["Store", "not created yet"]] },
  { id: "eval", title: "Evaluator workflows", count: "Later", planned: true, edge: "NSR, ENSDF, EXFOR, ENDF", rows: [["New papers", "per nuclide"], ["Gaps", "missing evaluations"], ["Measured vs evaluated", "EXFOR against ENDF"]] },
]
