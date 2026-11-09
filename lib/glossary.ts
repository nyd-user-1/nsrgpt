// Every term the app shows and explains: the short label used on screen, its full name, what it means, and its group.
// pax2's src/lib/glossary.ts, its shape kept (2026-11-08); the terms are nuclear data's. The Glossary page sorts them
// A to Z by the full name.

export type Term = { id: string; short: string; full: string; definition: string; group: "Datasets" | "Keys and formats" | "Physics" | "Decay" | "Processes" | "The lake" }

export const GLOSSARY: Term[] = [
  // Datasets
  { id: "ensdf", short: "ENSDF", full: "Evaluated Nuclear Structure Data File (ENSDF)", group: "Datasets", definition: "The evaluated record of every known nuclide's levels, gamma rays and decays, kept by the NSDD network and published by NNDC; NSRgpt holds the 2026-11-05 release, 20,117 datasets." },
  { id: "xundl", short: "XUNDL", full: "Experimental Unevaluated Nuclear Data List (XUNDL)", group: "Datasets", definition: "New structure measurements compiled in ENSDF's format before an evaluator has reviewed them; 12,547 datasets." },
  { id: "nsr", short: "NSR", full: "Nuclear Science References (NSR)", group: "Datasets", definition: "The bibliography of nuclear physics since 1896, each paper indexed by the nuclides, reactions and quantities it reports; 303,568 references." },
  { id: "exfor", short: "EXFOR", full: "Experimental Nuclear Reaction Data (EXFOR)", group: "Datasets", definition: "The library of measured reaction data, cross sections and yields, with the experiment's details, kept by the NRDC network; 27,116 entries." },
  { id: "endf", short: "ENDF", full: "Evaluated Nuclear Data File (ENDF)", group: "Datasets", definition: "An evaluated library of reaction data for transport codes, a recommended value at every energy built from the measurements and models; ENDF/B-VIII.1 is the US release, and NSRgpt holds every release from II." },
  { id: "evaluated-library", short: "Evaluated library", full: "Evaluated library", group: "Datasets", definition: "A complete, recommended set of nuclear data for every material it covers, made by evaluators from the measurements and models, such as ENDF/B, JEFF, JENDL or TENDL." },
  { id: "evaluated-vs-measured", short: "Measured against evaluated", full: "Evaluated against measured", group: "Datasets", definition: "Setting an evaluation's curve beside the EXFOR points it was built from, to see where the library agrees with experiment and where it does not." },

  // Keys and formats
  { id: "nucid", short: "NUCID", full: "Nuclide identifier (NUCID)", group: "Keys and formats", definition: "ENSDF's five-character name for a nuclide, the mass number then the element, as in 60CO; it opens every card of a dataset." },
  { id: "dsid", short: "DSID", full: "Dataset identifier (DSID)", group: "Keys and formats", definition: "The name of an ENSDF dataset after its NUCID, saying what it holds, as in ADOPTED LEVELS, GAMMAS or 60CO B- DECAY." },
  { id: "mat", short: "MAT", full: "Material number (MAT)", group: "Keys and formats", definition: "ENDF's number for one material in a library, as 9228 for uranium-235; every record of that evaluation carries it." },
  { id: "mf-mt", short: "MF and MT", full: "File and reaction numbers (MF and MT)", group: "Keys and formats", definition: "ENDF's two codes for where a record sits: MF names the kind of data (3 for cross sections, 8 for decay) and MT the reaction (18 for fission, 102 for capture)." },
  { id: "entry-number", short: "Entry number", full: "EXFOR entry number", group: "Keys and formats", definition: "The five-character number of one experiment's work in EXFOR, as 10001; its subentries add three digits, as 10001002." },
  { id: "key-number", short: "Key number", full: "NSR key number", group: "Keys and formats", definition: "The eight-character key of one paper in NSR, its year then the first author and a sequence, as 2011CH57." },
  { id: "x4", short: "X4", full: "EXFOR exchange format (X4)", group: "Keys and formats", definition: "EXFOR's fixed-column text format, an entry's bibliography followed by its data tables, the form the Library's EXFOR 10001 file is in." },
  { id: "pointwise", short: "Pointwise", full: "Pointwise cross section", group: "Keys and formats", definition: "A cross section written as values at a list of energies, reconstructed from the evaluation's resonance parameters so a code can read it directly." },

  // Physics
  { id: "nuclide", short: "Nuclide", full: "Nuclide", group: "Physics", definition: "An atom's nucleus with a given number of protons and neutrons, written as the mass number and the element, as 137Cs." },
  { id: "half-life", short: "Half-life", full: "Half-life", group: "Physics", definition: "The time in which half of a sample of a radioactive nuclide decays." },
  { id: "branching", short: "Branching", full: "Branching ratio", group: "Physics", definition: "The share of a nuclide's decays that go one way when it can decay more than one way, as 64% β− and 36% α for 212Bi." },
  { id: "jpi", short: "Jπ", full: "Spin and parity (Jπ)", group: "Physics", definition: "A level's angular momentum J and its parity, + or −, as 7/2+ for the ground state of 137Cs." },
  { id: "q-value", short: "Q-value", full: "Q-value", group: "Physics", definition: "The energy a decay or reaction releases, positive when it gives energy out and negative when it needs energy put in." },
  { id: "cross-section", short: "Cross section", full: "Cross section", group: "Physics", definition: "How likely a reaction is, given as an area in barns; it changes with the energy of the incoming particle." },
  { id: "resonance", short: "Resonance", full: "Resonance", group: "Physics", definition: "A narrow energy at which a cross section rises sharply because the incoming particle and the target form a compound state." },
  { id: "level-scheme", short: "Level scheme", full: "Level scheme", group: "Physics", definition: "A nuclide's excited levels drawn by energy, with the gamma rays between them and the decays that feed them." },
  { id: "isomer", short: "Isomer", full: "Isomer", group: "Physics", definition: "An excited level that lives long enough to count as a state of its own, written with an m, as 137mBa." },

  // Decay
  { id: "alpha", short: "α", full: "Alpha decay (α)", group: "Decay", definition: "The nucleus emits a helium-4 nucleus, two protons and two neutrons, so its mass number falls by 4 and its charge by 2." },
  { id: "beta-minus", short: "β−", full: "Beta-minus decay (β−)", group: "Decay", definition: "A neutron turns into a proton, giving out an electron and an antineutrino, so the charge rises by 1 at the same mass." },
  { id: "beta-plus", short: "β+", full: "Beta-plus decay (β+)", group: "Decay", definition: "A proton turns into a neutron, giving out a positron and a neutrino, so the charge falls by 1 at the same mass." },
  { id: "ec", short: "EC", full: "Electron capture (EC)", group: "Decay", definition: "The nucleus takes in one of its own atom's electrons and a proton turns into a neutron, with the same result as β+ but no positron." },
  { id: "it", short: "IT", full: "Isomeric transition (IT)", group: "Decay", definition: "An isomer drops to a lower level of the same nuclide by giving out a gamma ray or a conversion electron." },
  { id: "sf", short: "SF", full: "Spontaneous fission (SF)", group: "Decay", definition: "A heavy nucleus splits on its own into two lighter nuclei and a few neutrons." },
  { id: "decay-chain", short: "Decay chain", full: "Decay chain", group: "Decay", definition: "The run of decays from a long-lived nuclide down to a stable one, as the thorium series from 232Th to 208Pb." },

  // Processes
  { id: "s-process", short: "s-process", full: "Slow neutron capture process (s-process)", group: "Processes", definition: "Nucleosynthesis in which a nucleus captures neutrons slowly enough to β− decay between captures, so it walks along the valley of stable nuclides." },
  { id: "r-process", short: "r-process", full: "Rapid neutron capture process (r-process)", group: "Processes", definition: "Nucleosynthesis in which neutrons arrive faster than nuclei can decay, building very neutron-rich nuclides that then decay back towards stability." },
  { id: "rp-process", short: "rp-process", full: "Rapid proton capture process (rp-process)", group: "Processes", definition: "Nucleosynthesis on the proton-rich side, by fast proton captures and β+ decays, as in X-ray bursts on neutron stars." },

  // The lake
  { id: "raw-layer", short: "Raw", full: "Raw layer", group: "The lake", definition: "The lake's first layer: every file exactly as its source served it, kept under the source's own paths." },
  { id: "parsed-layer", short: "Parsed", full: "Parsed layer", group: "The lake", definition: "The lake's second layer: the raw files read into tables, one Parquet table per kind of record." },
  { id: "serving-layer", short: "Serving", full: "Serving layer", group: "The lake", definition: "The lake's third layer: tables shaped for the pages and the API to read quickly, built from the parsed tables." },
  { id: "athena", short: "Athena", full: "Amazon Athena", group: "The lake", definition: "The service that runs SQL over the lake's Parquet tables where they sit, for the parsing and the API's slower questions." },
  { id: "glue", short: "Glue", full: "AWS Glue Data Catalog", group: "The lake", definition: "The catalog that names every lake table and its columns, the database nsr that Athena reads." },
  { id: "api", short: "API", full: "NSRgpt API (nsr-api)", group: "The lake", definition: "The service the pages call for nuclides, ENDF cross sections, EXFOR entries and search, one Lambda function behind CloudFront." },
  { id: "keyword-index", short: "Keyword index", full: "Keyword search index", group: "The lake", definition: "The index behind Search: every dataset's titles and keys, so a word finds the EXFOR entries, ENSDF datasets and papers that hold it." },
]

export const termById = (id: string) => GLOSSARY.find((t) => t.id === id)
