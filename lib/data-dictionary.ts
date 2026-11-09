// Every field the API returns or a page shows: its name, type, source dataset, lake table, what it holds, and where it
// appears. Built for NSRgpt (brief 32, 2026-11-08) in lib/glossary.ts's shape, so the two pages' code stays parallel.
// Rows from services/nsr-api (README.md's route schemas; structure.py, keyword_search.py and lambda_function.py for the
// exact fields) and the serving tables' columns in the Glue catalog nsr. Types are the catalog's. Pages list where the
// app shows the field; route is the API path that returns it. Paging and timing fields (page, pages, took_ms) are left out.

export type Dataset = "ENSDF" | "ENDF/B" | "EXFOR" | "NSR" | "Every dataset"
export type Field = { id: string; field: string; type: string; dataset: Dataset; table: string; description: string; pages: string[]; route: string }

/** The groups in the order the page shows them. */
export const DATASETS: Dataset[] = ["ENSDF", "ENDF/B", "EXFOR", "NSR", "Every dataset"]

type Spec = [field: string, type: string, description: string, pages?: string[]]

const rows = (dataset: Dataset, table: string, route: string, specs: Spec[]): Field[] =>
  specs.map(([field, type, description, pages = []]) => ({ id: `${table}.${field}`, field, type, dataset, table, description, pages, route }))

const GRAPH = ["/graph"]
const SEARCH = ["/search"]

export const DICTIONARY: Field[] = [
  // ENSDF: /nuclide/{name}
  ...rows("ENSDF", "nuclide_serve_summary", "/nuclide/{name}", [
    ["z", "int", "Proton number."],
    ["n", "int", "Neutron number."],
    ["a", "int", "Mass number."],
    ["symbol", "string", "Element symbol, as Cs."],
    ["name", "string", "Nuclide name, mass number then symbol, as 137Cs; the route takes it."],
    ["nucid", "string", "ENSDF's five-character nuclide identifier, as 137CS."],
    ["half_life_s", "double", "Ground-state half-life in seconds; empty for a stable nuclide."],
    ["half_life_text", "string", "Ground-state half-life as ENSDF writes it, with its unit and uncertainty."],
    ["decay_modes", "string", "Decay modes with their percentages, as ENSDF writes them."],
    ["n_levels", "int", "Number of adopted levels."],
    ["n_gammas", "int", "Number of adopted gammas."],
    ["n_datasets", "bigint", "Number of ENSDF and XUNDL datasets for the nuclide."],
    ["has_xundl", "boolean", "Whether XUNDL holds unevaluated data for the nuclide."],
    ["adopted_dsid", "string", "The dataset the adopted levels and gammas come from."],
    ["jpi_ground", "string", "Ground-state spin and parity."],
    ["q_minus_kev", "double", "β− decay Q-value, keV."],
    ["sn_kev", "double", "Neutron separation energy, keV."],
    ["sp_kev", "double", "Proton separation energy, keV."],
    ["qa_kev", "double", "α decay Q-value, keV."],
  ]),
  ...rows("ENSDF", "nuclide_serve_levels", "/nuclide/{name}/levels", [
    ["level_seq", "int", "The level's place in the adopted dataset, from the ground state up."],
    ["energy_kev", "double", "Level energy, keV.", GRAPH],
    ["energy_text", "string", "Level energy as ENSDF writes it."],
    ["energy_unc", "double", "Uncertainty of the level energy, keV."],
    ["jpi", "string", "Spin and parity.", GRAPH],
    ["half_life_s", "double", "Half-life in seconds.", GRAPH],
    ["half_life_text", "string", "Half-life as ENSDF writes it, or STABLE.", GRAPH],
    ["decay_modes_text", "string", "The level's decay modes and percentages, as ENSDF writes them."],
    ["ms", "string", "Metastable-state mark, as M1."],
    ["band", "string", "Band label."],
    ["flag", "string", "ENSDF's flag column, the level's footnote marks."],
  ]),
  ...rows("ENSDF", "nuclide_serve_gammas", "/nuclide/{name}/gammas", [
    ["level_seq", "int", "The initial level's level_seq."],
    ["level_energy_kev", "double", "Initial level energy, keV.", GRAPH],
    ["final_level_seq", "int", "The final level's level_seq, where the energy difference picks one level."],
    ["final_level_energy_kev", "double", "Final level energy, keV.", GRAPH],
    ["e_gamma_kev", "double", "Gamma-ray energy, keV.", GRAPH],
    ["e_gamma_unc", "double", "Uncertainty of the gamma-ray energy, keV."],
    ["e_gamma_text", "string", "Gamma-ray energy as ENSDF writes it."],
    ["ri", "double", "Relative photon intensity.", GRAPH],
    ["ri_unc", "double", "Uncertainty of the relative photon intensity."],
    ["mult", "string", "Multipolarity, as E2 or M1+E2."],
    ["mr", "double", "Mixing ratio."],
    ["mr_unc", "double", "Uncertainty of the mixing ratio."],
    ["cc", "double", "Total conversion coefficient."],
    ["cc_unc", "double", "Uncertainty of the conversion coefficient."],
    ["ti", "double", "Relative total transition intensity."],
    ["ti_unc", "double", "Uncertainty of the total transition intensity."],
  ]),
  ...rows("ENSDF", "nuclide_serve_decays", "/nuclide/{name}", [
    ["parent", "string", "Parent nuclide name."],
    ["parent_z", "int", "Parent's proton number."],
    ["parent_a", "int", "Parent's mass number."],
    ["daughter", "string", "Daughter nuclide name."],
    ["daughter_z", "int", "Daughter's proton number."],
    ["daughter_a", "int", "Daughter's mass number."],
    ["mode", "string", "Decay mode, as B-, EC, A or IT."],
    ["dsid", "string", "Identifier of the decay dataset."],
    ["parent_level_kev", "double", "Energy of the decaying level, keV; 0 for the ground state."],
    ["parent_jpi", "string", "Spin and parity of the decaying level."],
    ["half_life_s", "double", "Parent's half-life in seconds."],
    ["half_life_text", "string", "Parent's half-life as ENSDF writes it."],
    ["q_kev", "double", "Decay Q-value, keV."],
    ["q_unc_kev", "double", "Uncertainty of the Q-value, keV."],
    ["branching_pct", "double", "Share of the parent's decays that go this way, percent."],
    ["branching_unc_pct", "double", "Uncertainty of the branching, percent."],
    ["n_gammas", "int", "Gammas in the decay dataset."],
    ["n_parents", "bigint", "Parent records in the decay dataset."],
    ["dataset_seq", "int", "The ENSDF dataset's number in the release."],
  ]),

  // ENDF/B: /endf/materials, /endf/xs, /endf/mt
  ...rows("ENDF/B", "endf_serve_materials", "/endf/materials", [
    ["sublibrary", "string", "Sublibrary, as neutrons or protons."],
    ["folder", "string", "Release, as B-VIII.1."],
    ["mat", "int", "ENDF material number, as 9228 for U-235."],
    ["za", "double", "1000 × Z + A."],
    ["z", "int", "Proton number."],
    ["a", "int", "Mass number."],
    ["liso", "int", "Isomeric state number; 0 for the ground state."],
    ["name", "string", "Material name, as U-235."],
    ["zsymam", "string", "ENDF's name field, as 92-U-235."],
    ["awr", "double", "Mass in units of the neutron mass."],
    ["temp_k", "double", "Temperature, K."],
    ["nsub", "int", "ENDF's sublibrary number."],
    ["lrp", "int", "ENDF's resonance-parameter flag: whether the file holds resonance parameters."],
    ["n_mf3_sections", "bigint", "Cross-section sections (MF3) in the material."],
    ["n_points", "bigint", "Points across those sections."],
    ["lab", "string", "Laboratory that made the evaluation."],
    ["edate", "string", "Evaluation date."],
    ["authors", "string", "Evaluators."],
  ]),
  ...rows("ENDF/B", "endf_serve_xs", "/endf/xs", [
    ["sublibrary", "string", "Sublibrary, as neutrons."],
    ["name", "string", "Material name, as U-235."],
    ["z", "int", "Proton number."],
    ["a", "int", "Mass number."],
    ["liso", "int", "Isomeric state number."],
    ["za", "double", "1000 × Z + A."],
    ["mat", "int", "ENDF material number."],
    ["mt", "int", "Reaction number, as 18 for fission or 102 for capture."],
    ["n_points", "bigint", "Points in the section."],
    ["e_min", "double", "Lowest energy, eV."],
    ["e_max", "double", "Highest energy, eV."],
    ["interp_nbt", "array<int>", "Where each interpolation region ends, by point."],
    ["interp_law", "array<int>", "Each region's interpolation law, as ENDF numbers them."],
    ["qm", "double", "Mass-difference Q-value, eV."],
    ["qi", "double", "Reaction Q-value, eV."],
    ["lr", "int", "ENDF's breakup flag for the reaction."],
    ["energy_ev", "array<double>", "Energies, eV."],
    ["xs_barn", "array<double>", "Cross section at each energy, barns."],
    ["n_served", "bigint", "Points returned; fewer than n_points when the series is thinned."],
    ["thinned", "boolean", "Whether a series over 40,000 points was cut to the lowest and highest point in each of 20,000 log-energy steps."],
  ]),
  ...rows("ENDF/B", "API response", "/endf/xs", [
    ["release", "string", "The release asked for, as B-VIII.1."],
    ["release_served", "string", "The release that answered: NNDC's reconstructed POINT library where it holds the section, else the file's own MF3."],
    ["held", "boolean", "Whether the lake holds the release; false for one it doesn't, as JEFF-3.3."],
  ]),
  ...rows("ENDF/B", "endf_serve_mt_names", "/endf/mt", [
    ["mt", "int", "Reaction number."],
    ["reaction", "string", "The reaction, as (n,f)."],
    ["name", "string", "The reaction's name in ENDF-102."],
    ["description", "string", "What the reaction number covers, from ENDF-102."],
  ]),

  // EXFOR: /exfor/search, /exfor/subentry/{id}, /exfor/pickers/{name}
  ...rows("EXFOR", "exfor_serve_search_index", "/exfor/search", [
    ["dataset", "string", "One data table: the subentry and its pointer, as 10001002 or O04060152."],
    ["entry", "string", "EXFOR entry number, five characters, as 10001."],
    ["subent", "string", "Subentry number, eight characters, as 10001002."],
    ["pointer", "string", "Pointer within the subentry; empty when it holds one data table."],
    ["target_sym", "string", "Target as a symbol, as U-235."],
    ["target", "string", "Target as EXFOR writes it, as 92-U-235."],
    ["reaction", "string", "Projectile and process, as N,F."],
    ["quantity", "string", "Quantity code, as SIG for a cross section."],
    ["sf6", "string", "REACTION subfield 6, the quantity's parameter."],
    ["code", "string", "The full REACTION code."],
    ["product", "string", "Reaction product, where the code names one."],
    ["energy_min_ev", "double", "Lowest incident energy in the data, eV."],
    ["energy_max_ev", "double", "Highest incident energy in the data, eV."],
    ["year", "bigint", "Year of the reference."],
    ["first_author", "string", "First author."],
    ["n_authors", "bigint", "Number of authors."],
    ["institute", "string", "Institute code, as 1USALAS."],
    ["reference", "string", "Reference code, as J,PR,104,1319,1956."],
    ["points", "bigint", "Data points."],
    ["has_c5", "boolean", "Whether IAEA's computational format (C5) holds the dataset."],
    ["units", "bigint", "Reaction units in the code: more than 1 for a ratio or sum of reactions."],
    ["subentry_date", "bigint", "Date the subentry was last changed, as YYYYMMDD."],
  ]),
  ...rows("EXFOR", "exfor_serve_targets", "/exfor/pickers/targets", [
    ["target", "string", "Target as EXFOR writes it."],
    ["target_sym", "string", "Target as a symbol."],
    ["target_za", "bigint", "1000 × Z + A."],
    ["target_z", "int", "Proton number."],
    ["target_state", "string", "Isomeric state, as M."],
    ["element", "string", "Element name."],
    ["datasets", "bigint", "Datasets with this target."],
    ["subentries", "bigint", "Subentries with this target."],
    ["entries", "bigint", "Entries with this target."],
    ["points", "bigint", "Data points with this target."],
  ]),
  ...rows("EXFOR", "exfor_serve_reactions", "/exfor/pickers/reactions", [
    ["reaction", "string", "Projectile and process, as N,F."],
    ["projectile", "string", "Projectile code, as N."],
    ["process", "string", "Process code, as F."],
    ["projectile_name", "string", "Projectile name, as neutron."],
    ["datasets", "bigint", "Datasets with this reaction."],
    ["subentries", "bigint", "Subentries with this reaction."],
    ["entries", "bigint", "Entries with this reaction."],
    ["targets", "bigint", "Targets with this reaction."],
  ]),
  ...rows("EXFOR", "exfor_serve_quantities", "/exfor/pickers/quantities", [
    ["quantity", "string", "Quantity code, as SIG."],
    ["sf6", "string", "REACTION subfield 6."],
    ["description", "string", "What the quantity is, as cross section."],
    ["units_family", "string", "The kind of units its data take."],
    ["sf6_description", "string", "What subfield 6 means."],
    ["datasets", "bigint", "Datasets with this quantity."],
    ["subentries", "bigint", "Subentries with this quantity."],
    ["entries", "bigint", "Entries with this quantity."],
    ["targets", "bigint", "Targets with this quantity."],
  ]),

  // NSR: /nsr/{key}
  ...rows("NSR", "search_nsr", "/nsr/{key}", [
    ["key_number", "string", "NSR key number, as 2011CH57; the route takes it."],
    ["year", "int", "Year of publication."],
    ["reference", "string", "Journal reference."],
    ["authors", "string", "Authors."],
    ["title", "string", "Title."],
    ["doi", "string", "DOI."],
    ["keywords", "string", "NSR's keyword abstract: what the paper measured or calculated."],
    ["nuclides", "string", "Nuclides the paper reports."],
    ["reactions", "string", "Reactions the paper reports."],
    ["reference_type", "string", "Kind of reference, as journal or report."],
    ["journal_code", "string", "NSR's journal code."],
    ["exfor_keys", "string", "EXFOR entry numbers compiled from the paper."],
    ["entry_date", "string", "Date the reference entered NSR."],
    ["modification_date", "string", "Date the reference last changed."],
  ]),

  // Every dataset: /search, /suggest
  ...rows("Every dataset", "search_docs", "/search", [
    ["type", "string", "Kind of record: exfor_dataset, exfor_entry, nsr, ensdf_dataset, xundl_dataset and others.", SEARCH],
    ["id", "string", "The record's key: a dataset, an entry number, an NSR key number, or NUCID:DSID.", SEARCH],
    ["name", "string", "The record's short name, as EXFOR 10001 or 137CS ADOPTED LEVELS.", SEARCH],
    ["title", "string", "The record's title.", SEARCH],
    ["url_path", "string", "The API route that returns the record.", SEARCH],
  ]),
  ...rows("Every dataset", "API response", "/search", [
    ["score", "double", "How well the record matches the words searched (BM25)."],
    ["total", "bigint", "Records that match."],
  ]),
  ...rows("Every dataset", "suggest", "/suggest", [
    ["name", "string", "A nuclide, reaction or author surname starting with what was typed."],
    ["kind", "string", "What the name is: nuclide, reaction or author."],
    ["records", "int", "Records naming it; the most named come first."],
  ]),
]

export const fieldById = (id: string) => DICTIONARY.find((f) => f.id === id)
