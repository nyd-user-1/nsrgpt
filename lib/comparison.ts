// /comparison (brief 66, new-worker-1): NSRgpt beside NNDC, IAEA-NDS and the NEA Data Bank, feature by feature.
// Every NSRgpt cell is from this site (its page or route in the title); every other cell was checked on the live site
// on 2026-11-10 from a browser user agent, with the page checked in the cell's title. Where IAEA's pages answered a
// browser challenge that day, the cell rests on the lake's browser-rendered copy of the same page from 2026-11-07
// (raw/iaea/2026-11-07/…), and its title says so. A cell with nothing found is null and reads "not found on <date>",
// never a guess. A fifth column (JAEA for JENDL, KAERI) was left out: its rows were not all checked.

export type SiteKey = "nsrgpt" | "nndc" | "iaea" | "nea"

/** `src`: the organisation's logo (an image path or URL), drawn 20 px before its name; empty draws a neutral circle until
 *  Brendan fills it in. `tinted`: the column shaded as the reference's recommended plan is. */
export type Site = { key: SiteKey; name: string; src: string; tinted?: boolean }

/** true: has it (a check); a string: has it, this much; null: not found on the date checked. The title says where. */
export type Cell = { v: true | string | null; title: string }

export type Row = { label: string; checked: string; cells: Record<SiteKey, Cell> }
export type Group = { name: string; rows: Row[] }

export const CHECKED = "2026-11-10"
const CAPTURED = "2026-11-07"

export const SITES: Site[] = [
  { key: "nsrgpt", name: "NSRgpt", src: "/logos/nsrgpt.svg", tinted: true },
  { key: "nndc", name: "NNDC", src: "/logos/nndc.jpg" },
  { key: "iaea", name: "IAEA-NDS", src: "/logos/iaea-nds.png" },
  { key: "nea", name: "NEA", src: "/logos/nea.png" },
]

/* ── the cells ─────────────────────────────────────────────────────────────── */

/** NSRgpt: has it, at this page or route. */
const M = (where: string, v: true | string = true): Cell => ({ v, title: `NSRgpt: ${where}` })
/** NSRgpt: does not have it. */
const Mno = (why: string): Cell => ({ v: null, title: `not on NSRgpt on ${CHECKED}: ${why}` })
/** Another site: found on the live page, checked on the date. */
const Y = (url: string, note = "", v: true | string = true): Cell => ({ v, title: `${note ? `${note}. ` : ""}${url}, checked ${CHECKED}` })
/** IAEA: found on the lake's rendered copy of the page (the live page answered a browser challenge on the date). */
const C = (url: string, note: string, v: true | string = true): Cell => ({ v, title: `${note}. ${url} as rendered ${CAPTURED}; the live page answered a browser challenge on ${CHECKED}` })
/** Not found on the date at the pages checked. */
const N = (...urls: string[]): Cell => ({ v: null, title: `not found on ${CHECKED} at ${urls.join(", ")}` })

// The pages checked
const NNDC = "https://www.nndc.bnl.gov/"
const NDB = "https://www.nndc.bnl.gov/databases/"
const NNSR = "https://www.nndc.bnl.gov/nsr/"
const NENDF = "https://www.nndc.bnl.gov/endf/"
const NADV = "https://www.nndc.bnl.gov/endf/advanced.html"
const NLIB = "https://www.nndc.bnl.gov/endf-library/"
const NREL = "https://www.nndc.bnl.gov/endf-releases/"
const NUDAT = "https://www.nndc.bnl.gov/nudat3/"
const SIGMA = "https://www.nndc.bnl.gov/sigma/"
const NTOOLS = "https://www.nndc.bnl.gov/tools/"
const IX = "https://www-nds.iaea.org/exfor/"
const IE = "https://www-nds.iaea.org/exfor/endf.htm"
const IC = "https://www-nds.iaea.org/exfor/cinda.htm"
const IL = "https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html"
const IAPI = "https://www-nds.iaea.org/relnsd/vcharthtml/api_v0_guide.html"
const IS = "https://www-nds.iaea.org/stopping/"
const IMED = "https://www-nds.iaea.org/medical/"
const ICON = "https://www-nds.iaea.org/conderc/"
const JW = "https://www.oecd-nea.org/janisweb/"
const JE = "https://www.oecd-nea.org/janisweb/search/endf"
const JX = "https://www.oecd-nea.org/janisweb/search/exfor"
const JP = "https://www.oecd-nea.org/jcms/pl_39910/janis"
const JEFF = "https://www.oecd-nea.org/dbdata/jeff/jeff33/downloads/"

const row = (label: string, nsrgpt: Cell, nndc: Cell, iaea: Cell, nea: Cell): Row => ({ label, checked: CHECKED, cells: { nsrgpt, nndc, iaea, nea } })
const none = (label: string, nsrgpt: Cell) => row(label, nsrgpt, N(NNDC, NDB), N(IX, IE), N(JW, JP))

export const GROUPS: Group[] = [
  {
    name: "Data held",
    rows: [
      row("NSR papers", M("303,568 papers, /counts", "304K"), Y(NNSR, "Nuclear Science References"), N(IX, IE), N(JW, JP)),
      row("ENSDF", M("20,117 datasets, /datasets/ensdf", "20K"), Y(NDB, "17,269 datasets", "17K"), Y(IL, "Live Chart, from ENSDF"), N(JW, JP)),
      row("XUNDL", M("12,547 datasets, /datasets/xundl", "13K"), Y(NDB, "4,212 datasets", "4.2K"), N(IL, IX), N(JW, JP)),
      row("EXFOR", M("190,430 datasets in 27,070 entries, /datasets/exfor", "190K"), Y(NDB, "listed with the reaction databases; its /exfor/ opens IAEA-NDS's EXFOR", "via IAEA"), C(IX, "25,842 experiments", "26K"), Y(JX, "JANIS EXFOR search")),
      row("ENDF/B (every release)", M("ENDF/B-II to B-VIII.1, /datasets/endf", "9 releases"), Y(NREL, `full releases for download (${NLIB}); ENDF/B-II to B-VIII.1 held in the lake from NNDC on ${CAPTURED}`), C(IE, "ENDF/B-V, VI.8, VII.0, VII.1, VIII.0 and VIII.1", "6 releases"), Y(JE, "ENDF/B-VI.8, VII.0, VII.1 and VIII.0", "4 releases")),
      row("JEFF-3.3", M("/datasets/endf"), Y(NENDF), C(IE, "JEFF-3.3"), Y(JE)),
      row("JENDL-5", M("/datasets/endf"), Y(NENDF), C(IE, "JENDL-5"), N(JE)),
      row("TENDL-2023", M("/datasets/endf"), N(NENDF, NADV), C(IE, "TENDL-2023"), N(JE)),
      row("CENDL-3.2", M("/datasets/endf"), Y(NENDF), C(IE, "CENDL-3.2"), Y(JE)),
      row("POINT files (reconstructed, broadened)", M("POINT2025 and POINT2018, 0 K to 1800 K, /endf/xs"), Y(NLIB, `POINT2025 and POINT2018, held in the lake from NNDC on ${CAPTURED}`), C(IE, "pointwise libraries with reconstructed resonances, Doppler broadened at a given temperature"), N(JE, JW)),
      row("CINDA", M("603,010 lines, /cinda", "603K"), N(NDB, NNDC), C(IC, "CINDA, database version of 2023-09-19"), Y(JW, "JANIS CINDA search")),
      row("ICRP 107 decay data", M("1,252 nuclides, /icrp", "1.3K"), N(NDB, NTOOLS), N(IL, IE), N(JW, JP)),
      row("RIPL", M("RIPL-4 levels and masses, /ripl"), Y(NDB, "listed; links to www-nds.iaea.org/RIPL-3/", "via IAEA"), C(IE, "RIPL in its databases"), N(JW, JP)),
      row("IAEA stopping powers", M("274,092 values, /stopping", "274K"), N(NDB, NTOOLS), Y(IS), N(JW, JP)),
      row("BetaShape spectra", M("1,396 spectra, /betashape"), N(NDB, NUDAT), Y(IAPI, "Live Chart API, beta spectra (BetaShape)"), N(JW, JP)),
    ],
  },
  {
    name: "Search",
    rows: [
      row("By nuclide", M("/search, /datasets/ensdf"), Y(NUDAT), Y(IL), Y(JE, "by target")),
      row("By reaction", M("/datasets/exfor, /cinda"), Y(NENDF, "target, reaction, quantity"), C(IX, "target, reaction, quantity"), Y(JE)),
      row("By paper or author", M("/datasets/nsr, /search"), Y(NNSR, "author, nuclide, reaction, key number, DOI"), C(IX, "author and reference"), Y(JX, "author, institute, reference")),
      row("One search across every source", M("/search"), N(NNDC, NDB), N(IX, IE), N(JW)),
      none("Search by meaning (a trained model)", M("NSRcpt v2, /search")),
      row("CINDA index search", M("/cinda"), N(NNDC, NDB), C(IC, "CINDA search"), Y(JW, "JANIS CINDA search")),
      none("Results from several sources in one list", M("/search: papers, EXFOR, ENSDF, ENDF and nuclides in one list")),
    ],
  },
  {
    name: "View and plot",
    rows: [
      row("Cross section per reaction", M("/lab"), Y(SIGMA, "Sigma"), C(IE, "plotting"), Y(JW, "comparison of experimental and evaluated cross sections")),
      row("Several libraries on one plot", M("/lab, compare"), Y(NLIB, "plotting from multiple libraries"), C(IE, "EE-View, the experimental-evaluated data viewer"), Y(JW, "evaluated cross sections compared")),
      row("EXFOR points on the plot", M("/lab"), Y(NDB, "comparison plots including experimental data"), C(IX, "plotting and comparison to ENDF"), Y(JW, "comparison of experimental and evaluated cross sections")),
      row("Doppler broadening on demand", M("/lab, PREPRO jobs"), N(NENDF, SIGMA), { v: null, title: `not found on ${CHECKED}: ${IE} as rendered ${CAPTURED} offers pointwise files broadened at fixed temperatures, not on demand` }, N(JW, JE)),
      row("Resonance parameters", M("/endf/resonances"), Y(NENDF, "quantity res"), C(IE, "MF=2 parameters"), Y(JW, "JANIS resonances")),
      row("Covariances", M("/lab, /endf/cov"), Y(NENDF, "quantity cov"), C(IE, "plotting covariances"), Y(JW, "JANIS covariances")),
      row("Angular and energy distributions", Mno("held and served by the API (/endf/section), not drawn on a page yet"), Y(NENDF, "quantities da, de, da/de"), C(IE, "MF4 and MF5 plotting"), N(JE)),
      row("Decay radiations", M("/viz/chart, /icrp"), Y(NDB, "NuDat decay radiation"), Y(IAPI, "decay radiations"), Y(JW, "JANIS decay lines")),
      row("Decay chains", M("/viz/reactions, /graph"), N(NUDAT, NDB), Y(IL, "decay chain"), N(JW, JP)),
      row("Chart of nuclides", M("/viz/chart"), Y(NDB, "NuDat's interactive chart of nuclides"), Y(IL, "Live Chart of Nuclides"), N(JW, JP)),
      row("Level schemes", Mno("levels are listed per nuclide; a drawn level scheme is not built yet"), Y(NUDAT, "level scheme"), Y(IAPI, "levels and gammas"), N(JW, JP)),
      row("Fission yields", M("/endf/fy, from the nuclide card"), Y(SIGMA, "neutron-induced fission yields"), Y(IAPI, "independent and cumulative fission yields"), N(JE)),
    ],
  },
  {
    name: "Analysis",
    rows: [
      none("Every measurement against every library, ranked", M("/sweep")),
      none("Flagged EXFOR datasets", M("/sweep, flags")),
      row("Medical isotope production yields", M("/sweep/medical"), N(NDB, NTOOLS), C(IMED, "the medical portal"), N(JW, JP)),
      none("A test of the ranking against the next release", M("/sweep, retrodiction")),
      none("ICRP 107 against ENSDF", M("/sweep/icrp")),
      none("A workbench with reproducible notebooks", M("/lab")),
      row("Integral benchmarks", M("CoNDERC's OpenMC runs, /benchmarks", "CoNDERC"), N(NDB, NTOOLS), C(ICON, "CoNDERC"), N(JW, JP)),
    ],
  },
  {
    name: "Formats and access",
    rows: [
      row("REST API", M("the API behind every page"), N(NNDC, NDB), Y(IAPI, "Live Chart API; EXFOR and ENDF Web-API"), N(JW, JP)),
      none("MCP", Mno("no MCP server")),
      row("ENDF-6 download", M("/datasets/endf, each material's text"), Y(NDB, "data in the ENDF-6 format"), C(IE, "original ENDF libraries for FTP downloading"), Y(JEFF, `JEFF-3.3 files, held in the lake from this page on ${CAPTURED}`)),
      row("GNDS 2.0 download", M("/gnds"), N(NLIB), N(IE), N(JW, JP)),
      none("Compile an uploaded file to GNDS", M("/datasets/endf, /gnds")),
      row("CSV and JSON export", M("/lab export; JSON from every route"), N(NUDAT, NENDF), C(IX, "CSV; JSON from ENDF and the Live Chart API"), N(JW, JX)),
      row("Bulk mirror or FTP", Mno("the lake is not public"), Y(NLIB, "download full releases"), C(IE, "FTP downloading; EXFOR's J4, C4 and X4Pro files"), Y(JP, "downloads: software, manual, DVD 4.0 ISO")),
      row("Processing codes online (NJOY, PREPRO)", M("PREPRO 2023 on the job box, /lab", "PREPRO"), N(NLIB, NTOOLS), N(IE), N(JW, JP)),
    ],
  },
  {
    name: "Working with it",
    rows: [
      none("Chat that cites records", M("/chat")),
      row("Saved views and workspaces", M("saves, Lab canvases"), N(NNDC), N(IX), Y(JW, "open a previously saved JANIS file")),
      row("Accounts", M("sign up to run"), N(NNDC), N(IX), N(JW)),
      row("Open source", Mno("the code is not public"), N(NNDC), N(IX), N(JW)),
      row("Desktop application", Mno("a web app"), N(NNDC), N(IX), Y(JP, "JANIS 4.1, standalone and Java Web Start")),
      row("Mobile layout", M("every page"), N(NNDC), N(IX), N(JW)),
    ],
  },
]

/** A group's "n of m" per site: a check or a value counts 1, a dash 0. */
export const countOf = (g: Group, k: SiteKey) => g.rows.filter((r) => r.cells[k].v !== null).length

/** Cells marked not found, outside NSRgpt's own column. */
export const notFound = () => GROUPS.flatMap((g) => g.rows).reduce((n, r) => n + (["nndc", "iaea", "nea"] as SiteKey[]).filter((k) => r.cells[k].v === null).length, 0)
