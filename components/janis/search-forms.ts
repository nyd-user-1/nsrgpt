// /janis/search (brief 67): JANIS Web's six search forms as data, their groups in order and their result columns, from
// oecd-nea.org/janisweb/search/* read 2026-11-10. Each option's mark: missing (JANIS has it, I do not), same, or ours
// (I hold it, JANIS does not).
export type Opt = { label: string; held: boolean; mark: "missing" | "same" | "ours" }
export type Group =
  | { label: string; kind: "select"; options: Opt[]; multiple?: boolean }
  | { label: string; kind: "target" | "energy" | "intensity" | "halflife" | "reference" | "institute" | "points" | "subentry" | "author" }
  | { label: string; kind: "text"; placeholder?: string }
  | { label: string; kind: "pair"; a: string; b: string }
  | { label: string; kind: "radio"; options: Opt[] }
  | { label: string; kind: "target2" | "mt2" }

const HELD = new Set(["CENDL-3.2", "ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "ENDF/B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023"])
// JANIS's own names: held or not; the ones it lacks and I hold come after, marked ours.
const opts = (names: string[], ours: string[] = []): Opt[] => [
  ...names.map((label) => ({ label, held: HELD.has(label), mark: HELD.has(label) ? ("same" as const) : ("missing" as const) })),
  ...ours.map((label) => ({ label, held: true, mark: "ours" as const })),
]
const ALL = (names: string[]): Opt[] => names.map((label) => ({ label, held: true, mark: "same" as const }))
const BASES = ALL(["Radioactive data", "Incident neutron data", "Incident gamma data", "Incident proton data", "Incident deuteron data", "Incident triton data", "Incident He3 data", "Incident alpha data"])
const TENDL_OLD = ["TENDL-2009", "TENDL-2010", "TENDL-2011", "TENDL-2012", "TENDL-2013", "TENDL-2014", "TENDL-2015", "TENDL-2017", "TENDL-2019"]
const ENDF_LIBS = opts(["BROND-2.2", "BROND-3.1", "CENDL-2.1", "CENDL-3.1", "CENDL-3.2", "EAF-2007", "EAF-2010", "ENDF/B-VI.8", "ENDF/B-VI.8-HE",
  "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "FENDL-2.1", "FENDL-3.1b", "GEFY-3.3", "GEFY-4.2", "GEFY-5.2", "GEFY-5.3", "GEFY-6.1",
  "GEFY-6.2", "GEFY-8.1", "GEFY-9.1", "IAEA/PD-2019", "IRDF-2002", "IRDF-2002 MG", "IRDFF-1.0", "IRDFF-1.0-640g", "IRDFF-1.05", "IRDFF-II",
  "JEF-2.2", "JEFF-3.0", "JEFF-3.0/A", "JEFF-3.1", "JEFF-3.1.1", "JEFF-3.1.2", "JEFF-3.2", "JEFF-3.3", "JEFF-4.0", "JENDL-3.3", "JENDL-4.0",
  "JENDL-4.0/HE", "JENDL-4.0u", "JENDL/AC-2008", "JENDL/AD-2017", "JENDL/AN-2005", "JENDL/DDF-2015", "JENDL/DEU-2020", "JENDL/FPD-2000",
  "JENDL/FPD-2011", "JENDL/FPY-2011", "JENDL/HE-2007", "JENDL/PD-2004", "JENDL/PD-2016", "JENDL/PD-2016.1", "PADF-2007", "RUSFOND-2010",
  ...TENDL_OLD, "TSL ENDF/B-VI.8", "TSL ENDF/B-VII.0", "TSL JEFF-3.0", "TSL JEFF-3.1"], ["ENDF/B-VIII.1", "JENDL-5", "TENDL-2023"])
const RES_LIBS = opts(["BROND-2.2", "BROND-3.1", "CENDL-2.1", "CENDL-3.1", "CENDL-3.2", "ENDF/B-VI.8", "ENDF/B-VI.8-HE", "ENDF/B-VII.0",
  "ENDF/B-VII.1", "ENDF/B-VIII.0", "FENDL-2.1", "FENDL-3.1b", "IRDF-2002", "IRDF-2002 MG", "JEF-2.2", "JEFF-3.0", "JEFF-3.1", "JEFF-3.1.1",
  "JEFF-3.1.2", "JEFF-3.2", "JEFF-3.3", "JEFF-4.0", "JENDL-3.3", "JENDL-4.0", "JENDL-4.0/HE", "JENDL-4.0u", "JENDL/AC-2008", "JENDL/AD-2017",
  "JENDL/HE-2007", "RUSFOND-2010", ...TENDL_OLD], ["ENDF/B-VIII.1", "JENDL-5", "TENDL-2023"])
const DECAY_LIBS = opts(["ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "JEF-2.2", "JEFF-3.1", "JEFF-3.1.1", "JEFF-3.3", "JEFF-4.0",
  "JENDL/DDF-2015", "JENDL/FPD-2000", "JENDL/FPD-2011"], ["ENDF/B-VIII.1", "JENDL-5"])
const COV_LIBS = opts(["BROND-2.2", "BROND-3.1", "CENDL-3.1", "CENDL-3.2", "ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0",
  "FENDL-2.1", "FENDL-3.1b", "IRDFF-1.0", "IRDFF-1.0-640g", "IRDFF-1.05", "IRDFF-II", "JEF-2.2", "JEFF-3.0", "JEFF-3.1", "JEFF-3.1.1",
  "JEFF-3.1.2", "JEFF-3.2", "JEFF-3.3", "JEFF-4.0", "JENDL-3.3", "JENDL-4.0", "JENDL-4.0u", "RUSFOND-2010", ...TENDL_OLD], ["ENDF/B-VIII.1", "JENDL-5", "TENDL-2023"])

/** Each form's groups and result columns, as JANIS Web has them. */
export const FORMS: Record<string, { title: string; groups: Group[]; columns: string[] }> = {
  endf: {
    title: "ENDF",
    groups: [
      { label: "Incident particle", kind: "select", options: BASES, multiple: true },
      { label: "Library", kind: "select", options: ENDF_LIBS, multiple: true },
      { label: "Target", kind: "target" },
      { label: "MF", kind: "text", placeholder: "3" },
      { label: "MT", kind: "text", placeholder: "18" },
    ],
    columns: ["Incident particle", "Evaluation", "Material", "MF", "MT"],
  },
  exfor: {
    title: "EXFOR",
    groups: [
      { label: "Target", kind: "target" },
      { label: "Quantity", kind: "pair", a: "Quantity group", b: "Quantity" },
      { label: "Reaction", kind: "pair", a: "Incident particle", b: "Process" },
      { label: "Product", kind: "target" },
      { label: "Energy range", kind: "energy" },
      { label: "Subentry", kind: "subentry" },
      { label: "Title", kind: "text" },
      { label: "Author", kind: "author" },
      { label: "Reference", kind: "reference" },
      { label: "Institute / Laboratory", kind: "institute" },
      { label: "Number of points", kind: "points" },
    ],
    columns: ["Subentry", "Target", "Product", "Reaction", "Q", "Q", "#pts", "E min", "E max", "Author(s)", "Title", "Institute", "Ref. Type", "Reference"],
  },
  cinda: {
    title: "CINDA",
    groups: [
      { label: "Target", kind: "target" },
      { label: "Reaction and Quantity", kind: "pair", a: "Quantity", b: "Incident / outgoing" },
      { label: "Energy range", kind: "energy" },
      { label: "Author", kind: "text" },
      { label: "Reference", kind: "reference" },
      { label: "Institute / Laboratory", kind: "institute" },
    ],
    columns: ["Material", "Quantity", "Reaction Process", "Energy Min", "Energy Max", "Lab", "Block", "Work Type", "Ref. Type", "Ref. Title", "Ref. Date (YYYY/MM)", "Author Comments"],
  },
  resonances: {
    title: "Resonances",
    groups: [
      { label: "Library", kind: "select", options: RES_LIBS, multiple: true },
      { label: "Target", kind: "target" },
      { label: "Energy range", kind: "energy" },
    ],
    columns: ["Incident particle", "Evaluation", "Material", "E"],
  },
  decay: {
    title: "Decay lines",
    groups: [
      { label: "Type", kind: "select", options: ALL(["All lines", "Alpha lines", "Photon lines"]) },
      { label: "Library", kind: "select", options: DECAY_LIBS, multiple: true },
      { label: "Target", kind: "target" },
      { label: "Half-life", kind: "halflife" },
      { label: "Energy range", kind: "energy" },
      { label: "Intensity range", kind: "intensity" },
    ],
    columns: ["Evaluation", "E", "E error", "Intensity", "Intensity error", "Type", "Material", "Half Life"],
  },
  covariances: {
    title: "Covariances",
    groups: [
      { label: "Incident particle", kind: "select", options: BASES, multiple: true },
      { label: "Library", kind: "select", options: COV_LIBS, multiple: true },
      { label: "Format", kind: "radio", options: [{ label: "BOXER", held: false, mark: "missing" }, { label: "ENDF", held: true, mark: "same" }] },
      { label: "Material #1", kind: "target" },
      { label: "Reaction #1", kind: "text", placeholder: "MT" },
      { label: "Material #2", kind: "target2" },
      { label: "Reaction #2", kind: "mt2" },
    ],
    columns: ["Incident particle", "Evaluation", "Format", "Material1", "MF1", "MT1", "Material2", "MF2", "MT2"],
  },
}
