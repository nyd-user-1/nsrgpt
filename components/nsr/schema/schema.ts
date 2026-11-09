import { MarkerType, type Edge, type Node } from "@xyflow/react"
import {
  Activity, Atom, BookOpen, ChartLine, Database, FileText, FlaskConical, GitFork, Layers, Link2, ListOrdered, Ruler, Search,
  Tags, Target, Waypoints, type LucideIcon,
} from "lucide-react"

// /schema's content (brief 32): pax-trinity's src/app/data-dictionary/schema.ts, its shape kept, its tables NSRgpt's. One
// table per serving table the API reads (services/nsr-api: structure.py, keyword_search.py, lambda_function.py) and the
// ENSDF and ENDF/B tables they are built from, with their columns and types as the Glue catalog nsr holds them
// (2026-11-08). Parquet holds no keys: a key mark is the column that names a row, a link the column a route or a build
// joins on. Laid out the way FactoryCanvas lays out the factory: every position derives from the constants above build().

export type Column = { name: string; type: string; key?: "primary" | "refers"; note?: string }
export type Table = { id: string; about: string; columns: Column[] }

/** Glue's "name:type name:type" spelling, as the catalog lists a table's columns. */
const cols = (spec: string, keys: Record<string, Column["key"]> = {}, notes: Record<string, string> = {}): Column[] =>
  spec.split(" ").map((s) => {
    const [name, type] = s.split(":")
    return { name, type, ...(keys[name] && { key: keys[name] }), ...(notes[name] && { note: notes[name] }) }
  })

export const TABLES: Table[] = [
  // ENSDF, parsed (lake/ensdf/2026-11-05/)
  {
    id: "ensdf_datasets",
    about: "One row per ENSDF or XUNDL dataset in a release: its NUCID, DSID, type, reference and card counts",
    columns: cols(
      "release:string dataset_seq:int file_name:string line_no:int nucid:string a:int element:string z:int dsid:string dstype:string dsref:string publication:string date:string history:string card_count:int record_count:int level_count:int gamma_count:int",
      { release: "primary", dataset_seq: "primary" },
      { dataset_seq: "with release, names the dataset", nucid: "five characters, as 137CS" },
    ),
  },
  {
    id: "ensdf_levels",
    about: "Every level card of every dataset, its energy, Jπ and half-life as the card spells them and as numbers",
    columns: cols(
      "release:string dataset_seq:int nucid:string dsid:string card_seq:int level_seq:int energy_kev:double energy_kev_raw:string energy_unc:double energy_unc_raw:string jpi:string half_life:double half_life_unit:string half_life_raw:string half_life_unc:double half_life_unc_raw:string l:string s:double s_raw:string s_unc:double s_unc_raw:string flag:string ms:string question:string band:string continuation:string",
      { dataset_seq: "refers", level_seq: "primary" },
      { level_seq: "with release and dataset_seq, names the level" },
    ),
  },
  {
    id: "ensdf_gammas",
    about: "Every gamma card, under the level card it follows: energy, intensity, multipolarity, mixing ratio, conversion",
    columns: cols(
      "release:string dataset_seq:int nucid:string dsid:string card_seq:int level_seq:int e_gamma:double e_gamma_raw:string unc:double unc_raw:string ri:double ri_raw:string ri_unc:double ri_unc_raw:string mult:string mr:double mr_raw:string mr_unc:double mr_unc_raw:string cc:double cc_raw:string cc_unc:double cc_unc_raw:string ti:double ti_raw:string ti_unc:double ti_unc_raw:string flag:string coincidence:string question:string continuation:string",
      { card_seq: "primary", level_seq: "refers" },
      { card_seq: "with release and dataset_seq, names the card" },
    ),
  },
  // Nuclides, serving (lake/serve/nuclide/2026-11-05/), read by /nuclide/{name}
  {
    id: "nuclide_serve_summary",
    about: "One row per nuclide: ground-state half-life, Jπ and decay modes, separation energies and Q-values, counts",
    columns: cols(
      "z:int n:int a:int symbol:string name:string nucid:string half_life_s:double half_life_text:string decay_modes:string n_levels:int n_gammas:int n_datasets:bigint has_xundl:boolean adopted_dsid:string jpi_ground:string q_minus_kev:double sn_kev:double sp_kev:double qa_kev:double",
      { name: "primary", nucid: "refers" },
      { name: "as 137Cs; /nuclide/{name} takes it" },
    ),
  },
  {
    id: "nuclide_serve_levels",
    about: "A nuclide's adopted levels, in energy order",
    columns: cols(
      "z:int n:int a:int name:string level_seq:int energy_kev:double energy_text:string energy_unc:double jpi:string half_life_s:double half_life_text:string decay_modes_text:string ms:string band:string flag:string",
      { name: "refers", level_seq: "primary" },
      { level_seq: "with name, names the level" },
    ),
  },
  {
    id: "nuclide_serve_gammas",
    about: "A nuclide's adopted gammas, each from its initial level to its final level",
    columns: cols(
      "z:int n:int a:int name:string level_seq:int level_energy_kev:double final_level_seq:int final_level_energy_kev:double e_gamma_kev:double e_gamma_unc:double e_gamma_text:string ri:double ri_unc:double mult:string mr:double mr_unc:double cc:double cc_unc:double ti:double ti_unc:double",
      { level_seq: "refers" },
      { final_level_seq: "the level the gamma ends on" },
    ),
  },
  {
    id: "nuclide_serve_decays",
    about: "One row per decay dataset: parent, daughter, mode, Q-value and branching",
    columns: cols(
      "parent:string parent_z:int parent_a:int daughter:string daughter_z:int daughter_a:int mode:string dsid:string parent_level_kev:double parent_jpi:string half_life_s:double half_life_text:string q_kev:double q_unc_kev:double branching_pct:double branching_unc_pct:double n_gammas:int n_parents:bigint dataset_seq:int",
      { parent: "refers", dataset_seq: "refers" },
      { daughter: "a name in the summary too" },
    ),
  },
  // Search (lake/serve/search/2026-11-08/), read by /search and /nsr/{key}
  {
    id: "search_docs",
    about: "Every record Search finds: EXFOR datasets and entries, NSR papers, ENSDF and XUNDL datasets. With search_docs_structure, the docs table of search.duckdb",
    columns: cols(
      "type:string id:string name:string title:string text:string keywords:array<string> dataset:string z:int a:int mt:int year:int url_path:string",
      { id: "primary" },
      { id: "with type, names the record", url_path: "the page a hit opens" },
    ),
  },
  {
    id: "search_nsr",
    about: "One row per NSR paper: the reference, authors, title, DOI and the nuclides and reactions it reports",
    columns: cols(
      "key_number:string year:int reference:string authors:string title:string doi:string keywords:string nuclides:string reactions:string reference_type:string journal_code:string exfor_keys:string entry_date:string modification_date:string",
      { key_number: "primary", exfor_keys: "refers" },
      { key_number: "as 2011CH57" },
    ),
  },
  // EXFOR, serving (lake/serve/exfor/2026-10-28/), read by /exfor/search and its pickers
  {
    id: "exfor_serve_search_index",
    about: "One row per EXFOR dataset (a subentry's data table under a pointer): target, reaction, quantity, energy range, reference",
    columns: cols(
      "dataset:string entry:string subent:string pointer:string code:string units:bigint unit_combination:string targets:array<string> target:string target_sym:string target_za:bigint target_state:string target_z:int projectile:string projectile_za:bigint process:string reaction:string product:string product_za:bigint quantity:string sf5:string sf6:string sf7:string sf8:string data_type:string energy_min_ev:double energy_max_ev:double year:bigint first_author:string n_authors:bigint institute:string reference:string title:string points:bigint columns:bigint subentry_date:bigint entry_date:bigint has_c5:boolean",
      { dataset: "primary", target: "refers", reaction: "refers", quantity: "refers" },
      { entry: "five characters, as 10001", subent: "eight characters, as 10001002" },
    ),
  },
  {
    id: "exfor_serve_targets",
    about: "The Target picker: every target in the index with its counts",
    columns: cols("target:string target_sym:string target_za:bigint target_z:int target_state:string element:string datasets:bigint subentries:bigint entries:bigint points:bigint", { target: "primary" }),
  },
  {
    id: "exfor_serve_reactions",
    about: "The Reaction picker: every projectile and process with its counts",
    columns: cols("reaction:string projectile:string process:string projectile_name:string datasets:bigint subentries:bigint entries:bigint targets:bigint", { reaction: "primary" }),
  },
  {
    id: "exfor_serve_quantities",
    about: "The Quantity picker: every quantity code with its description and counts",
    columns: cols("quantity:string sf6:string description:string units_family:string sf6_description:string datasets:bigint subentries:bigint entries:bigint targets:bigint", { quantity: "primary" }),
  },
  // ENDF/B, parsed (lake/endfb/)
  {
    id: "endfb_materials",
    about: "One row per material in every ENDF/B file: MAT, ZA, the header's dates, authors and description",
    columns: cols(
      "sublibrary:string file_name:string mat:int za:double zsymam:string awr:double lrp:int lfi:int nlib:int nmod:int elis:double sta:double lis:int liso:int nfor:int awi:double emax:double lrel:int nsub:int nver:int temp_k:double ldrv:int nwd:int nxc:int alab:string edate:string auth:string ref:string ddate:string rdate:string endate:string hsub:string description:string section_count:int line_count:int parser:string",
      { mat: "primary" },
      { mat: "with sublibrary and file_name, names the material" },
    ),
  },
  {
    id: "endfb_sections",
    about: "One row per section of a material: its MF and MT, Q-values and line span",
    columns: cols(
      "sublibrary:string file_name:string mat:int mf:int mt:int line_count:int first_line:int za:double awr:double qm:double qi:double lr:int nr:int np:int parser:string",
      { mat: "refers", mt: "primary" },
      { mt: "with file_name, MAT and MF, names the section" },
    ),
  },
  {
    id: "endfb_xs_points",
    about: "Every energy and cross-section point of every MF3 section",
    columns: cols("sublibrary:string file_name:string mat:int mt:int point_seq:int energy_ev:double xs_barn:double interpolation_region:int interpolation:int", { mt: "refers" }),
  },
  // ENDF, serving (lake/serve/endf/), read by /endf/materials, /endf/xs and /endf/mt
  {
    id: "endf_serve_materials",
    about: "The material index /endf/materials reads: every release's materials with their header fields and point counts",
    columns: cols(
      "sublibrary:string folder:string mat:int za:double z:int a:int liso:int name:string zsymam:string awr:double temp_k:double nsub:int lrp:int file_name:string n_mf3_sections:bigint n_points:bigint lab:string edate:string authors:string",
      { mat: "refers" },
      { folder: "the release, as B-VIII.1" },
    ),
  },
  {
    id: "endf_serve_xs",
    about: "One row per material and reaction in a release: the energy and cross-section arrays /endf/xs returns",
    columns: cols(
      "sublibrary:string name:string z:int a:int liso:int za:double mat:int mt:int n_points:bigint e_min:double e_max:double interp_nbt:array<int> interp_law:array<int> qm:double qi:double lr:int energy_ev:array<double> xs_barn:array<double> n_served:bigint thinned:boolean",
      { mat: "refers", mt: "refers", energy_ev: "refers" },
      { thinned: "true where n_served is under n_points" },
    ),
  },
  {
    id: "endf_serve_mt_names",
    about: "MT numbers with their reactions and names (ENDF-102), as /endf/mt lists them",
    columns: cols("mt:int reaction:string name:string description:string", { mt: "primary" }),
  },
]

/** A key line: from the referring column to the column it names. `label` is its hover and its words in the Tables and
 *  Keys panel. */
export type KeyData = { label: string; icon: LucideIcon; offset?: number }
type KeyLine = { id: string; from: [string, string, "l" | "r"]; to: [string, string, "l" | "r"]; data: KeyData }

export const KEYS: KeyLine[] = [
  // ENSDF
  { id: "levels-datasets", from: ["ensdf_levels", "dataset_seq", "l"], to: ["ensdf_datasets", "dataset_seq", "l"], data: { icon: Layers, label: "Each level card belongs to one dataset, by release and dataset_seq", offset: 28 } },
  { id: "gammas-levels", from: ["ensdf_gammas", "level_seq", "l"], to: ["ensdf_levels", "level_seq", "l"], data: { icon: Activity, label: "Each gamma card sits under the level card it follows, by release, dataset_seq and level_seq", offset: 48 } },
  // Nuclides
  { id: "summary-ensdf", from: ["nuclide_serve_summary", "nucid", "l"], to: ["ensdf_datasets", "nucid", "r"], data: { icon: Atom, label: "The nuclide's NUCID names its ENSDF and XUNDL datasets: n_datasets counts them, and adopted_dsid is the one its levels and gammas come from" } },
  { id: "decays-ensdf", from: ["nuclide_serve_decays", "dataset_seq", "l"], to: ["ensdf_datasets", "dataset_seq", "r"], data: { icon: FileText, label: "Each decay row comes from one ENSDF decay dataset, by dataset_seq" } },
  { id: "levels-summary", from: ["nuclide_serve_levels", "name", "r"], to: ["nuclide_serve_summary", "name", "r"], data: { icon: ListOrdered, label: "A nuclide's adopted levels, by name; /nuclide/{name}/levels pages them", offset: 28 } },
  { id: "gammas-levels-serve", from: ["nuclide_serve_gammas", "level_seq", "r"], to: ["nuclide_serve_levels", "level_seq", "r"], data: { icon: Activity, label: "Each gamma's initial level, by name and level_seq; final_level_seq names the level it ends on", offset: 48 } },
  { id: "decays-summary", from: ["nuclide_serve_decays", "parent", "r"], to: ["nuclide_serve_summary", "name", "r"], data: { icon: GitFork, label: "Each decay's parent is a nuclide in the summary, by name, and so is its daughter; /nuclide/{name} lists the decays both ways", offset: 68 } },
  // Search
  { id: "docs-summary", from: ["search_docs", "url_path", "l"], to: ["nuclide_serve_summary", "name", "r"], data: { icon: Search, label: "An ENSDF or XUNDL dataset found in Search opens its nuclide's page: url_path is /nuclide/ and the name" } },
  { id: "docs-nsr", from: ["search_docs", "id", "r"], to: ["search_nsr", "key_number", "r"], data: { icon: BookOpen, label: "A paper found in Search has its NSR key number as its id; /nsr/{key} reads the rest from search_nsr", offset: 28 } },
  { id: "docs-exfor", from: ["search_docs", "id", "r"], to: ["exfor_serve_search_index", "dataset", "l"], data: { icon: FlaskConical, label: "An EXFOR dataset found in Search has the dataset as its id, a whole entry its entry number" } },
  { id: "nsr-exfor", from: ["search_nsr", "exfor_keys", "r"], to: ["exfor_serve_search_index", "entry", "l"], data: { icon: Link2, label: "A paper's EXFOR keys are the entry numbers of the experiments compiled from it" } },
  // EXFOR
  { id: "index-targets", from: ["exfor_serve_search_index", "target", "r"], to: ["exfor_serve_targets", "target", "l"], data: { icon: Target, label: "Each dataset's target; the Target picker lists every one with its counts" } },
  { id: "index-reactions", from: ["exfor_serve_search_index", "reaction", "r"], to: ["exfor_serve_reactions", "reaction", "l"], data: { icon: Waypoints, label: "Each dataset's reaction; the Reaction picker lists every one with its counts" } },
  { id: "index-quantities", from: ["exfor_serve_search_index", "quantity", "r"], to: ["exfor_serve_quantities", "quantity", "l"], data: { icon: Ruler, label: "Each dataset's quantity; the Quantity picker lists every one with its description and counts" } },
  // ENDF
  { id: "sections-materials", from: ["endfb_sections", "mat", "l"], to: ["endfb_materials", "mat", "r"], data: { icon: Layers, label: "Each section belongs to one material, by sublibrary, file_name and MAT" } },
  { id: "points-sections", from: ["endfb_xs_points", "mt", "l"], to: ["endfb_sections", "mt", "r"], data: { icon: ChartLine, label: "Each point belongs to one MF3 section, by file_name, MAT and MT" } },
  { id: "serve-materials", from: ["endf_serve_materials", "mat", "l"], to: ["endfb_materials", "mat", "r"], data: { icon: Database, label: "The material index takes each material's MAT and header fields from the parsed file" } },
  { id: "xs-materials", from: ["endf_serve_xs", "mat", "l"], to: ["endf_serve_materials", "mat", "r"], data: { icon: Layers, label: "Each served cross section belongs to one material, by sublibrary and MAT" } },
  { id: "xs-points", from: ["endf_serve_xs", "energy_ev", "r"], to: ["endfb_xs_points", "energy_ev", "r"], data: { icon: ChartLine, label: "Its energy and cross-section arrays are the section's points; thinned says whether some were dropped for the page", offset: 28 } },
  { id: "xs-mt", from: ["endf_serve_xs", "mt", "r"], to: ["endf_serve_mt_names", "mt", "l"], data: { icon: Tags, label: "Its MT names the reaction (ENDF-102)" } },
]

// ---------------------------------------------------------------------------------------------
// The drawing's grid, left to right: ENSDF, the nuclide tables built from it, Search, the EXFOR index and its pickers,
// ENDF/B, and the ENDF tables built from it. Each table's key row sits level with the row it names where it can.

export const HEAD_H = 40 // a table's name
export const ROW_H = 24 // one column
export const FOOT_H = 8
export const rowY = (i: number) => HEAD_H + i * ROW_H + ROW_H / 2
export const tableH = (t: Table) => HEAD_H + t.columns.length * ROW_H + FOOT_H

const GAP = 150 // between columns: room for a chip and the loops
const W = 290
const X = (col: number) => col * (W + GAP)
const STACK = 48 // between tables in a column

const table = (id: string) => TABLES.find((t) => t.id === id)!
const at = (id: string, column: string) => table(id).columns.findIndex((c) => c.name === column)
const below = (id: string, top: number) => top + tableH(table(id)) + STACK
/** The top that puts a table's column level with another table's column, given that table's top. */
const level = (id: string, column: string, other: string, otherColumn: string, otherTop: number) => otherTop + rowY(at(other, otherColumn)) - rowY(at(id, column))

const Y_DATASETS = 0
const Y_ENSDF_LEVELS = below("ensdf_datasets", Y_DATASETS)
const Y_ENSDF_GAMMAS = below("ensdf_levels", Y_ENSDF_LEVELS)
const Y_SUMMARY = level("nuclide_serve_summary", "nucid", "ensdf_datasets", "nucid", Y_DATASETS)
const Y_LEVELS = below("nuclide_serve_summary", Y_SUMMARY)
const Y_GAMMAS = below("nuclide_serve_levels", Y_LEVELS)
const Y_DECAYS = below("nuclide_serve_gammas", Y_GAMMAS)
const Y_DOCS = 0
const Y_NSR = below("search_docs", Y_DOCS)
const Y_INDEX = level("exfor_serve_search_index", "dataset", "search_docs", "id", Y_DOCS)
const Y_TARGETS = level("exfor_serve_targets", "target", "exfor_serve_search_index", "target", Y_INDEX)
const Y_REACTIONS = Math.max(below("exfor_serve_targets", Y_TARGETS), level("exfor_serve_reactions", "reaction", "exfor_serve_search_index", "reaction", Y_INDEX))
const Y_QUANTITIES = Math.max(below("exfor_serve_reactions", Y_REACTIONS), level("exfor_serve_quantities", "quantity", "exfor_serve_search_index", "quantity", Y_INDEX))
const Y_MATERIALS = 0
const Y_SECTIONS = level("endfb_sections", "mat", "endfb_materials", "mat", Y_MATERIALS)
const Y_SERVE_MATERIALS = below("endfb_sections", Y_SECTIONS) + STACK
const Y_POINTS = level("endfb_xs_points", "mt", "endfb_sections", "mt", Y_SECTIONS)
const Y_XS = Math.max(below("endfb_xs_points", Y_POINTS), level("endf_serve_xs", "mat", "endf_serve_materials", "mat", Y_SERVE_MATERIALS))
const Y_MT = level("endf_serve_mt_names", "mt", "endf_serve_xs", "mt", Y_XS)

const PLACE: Record<string, [number, number]> = {
  ensdf_datasets: [X(0), Y_DATASETS],
  ensdf_levels: [X(0), Y_ENSDF_LEVELS],
  ensdf_gammas: [X(0), Y_ENSDF_GAMMAS],
  nuclide_serve_summary: [X(1), Y_SUMMARY],
  nuclide_serve_levels: [X(1), Y_LEVELS],
  nuclide_serve_gammas: [X(1), Y_GAMMAS],
  nuclide_serve_decays: [X(1), Y_DECAYS],
  search_docs: [X(2), Y_DOCS],
  search_nsr: [X(2), Y_NSR],
  exfor_serve_search_index: [X(3), Y_INDEX],
  exfor_serve_targets: [X(4), Y_TARGETS],
  exfor_serve_reactions: [X(4), Y_REACTIONS],
  exfor_serve_quantities: [X(4), Y_QUANTITIES],
  endfb_materials: [X(5), Y_MATERIALS],
  endfb_sections: [X(6), Y_SECTIONS],
  endf_serve_materials: [X(6), Y_SERVE_MATERIALS],
  endfb_xs_points: [X(7), Y_POINTS],
  endf_serve_xs: [X(7), Y_XS],
  endf_serve_mt_names: [X(8), Y_MT],
}

export type TableData = Table & { w: number }

export const FLOW = "#94a3b8"

export function build(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = TABLES.map((t) => {
    const [x, y] = PLACE[t.id]
    return { id: t.id, type: "table", position: { x, y }, data: { ...t, w: W } satisfies TableData, selectable: false }
  })
  const edges: Edge[] = KEYS.map((k) => ({
    id: k.id,
    source: k.from[0],
    sourceHandle: `${k.from[2]}-${k.from[1]}`,
    target: k.to[0],
    targetHandle: `${k.to[2]}-${k.to[1]}`,
    type: "key",
    data: k.data,
    markerEnd: { type: MarkerType.ArrowClosed, color: FLOW, width: 16, height: 16 },
  }))
  return { nodes, edges }
}
