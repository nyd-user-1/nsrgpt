// The diagram contract (brief 28). A diagram type is a spec: which grid, which node shape, which arrows, bands or not,
// legend or not. The library (lib/diagram/library/) holds one DiagramSpec per reference figure; the canvas draws a spec
// through lib/diagram/layout.ts toFlow(spec, config); the Config panel edits a DiagramConfig. No React here.

export type DiagramKind =
  | "decay-chain"
  | "reaction-network"
  | "activation-burnup"
  | "production-route"
  | "fission-fan"
  | "level-scheme"
export type NodeShape = "disc" | "square" | "rect"
export type GridKind = "element-rows" | "nz" | "free" | "ladder"
export type EdgeKind = "alpha" | "beta-" | "beta+" | "ec" | "it" | "capture" | "fission" | "gamma" | "sf"
export type LabelField = "A" | "Z" | "symbol" | "halflife" | "jpi" | "energy" | "percent"

export interface DiagramConfig {
  kind: DiagramKind
  subtype: string
  shape: NodeShape
  grid: GridKind
  bands: boolean
  legend: boolean
  labels: LabelField[]
  edges: EdgeKind[]
}

export interface DiagramNode {
  id: string
  z: number
  a: number
  symbol: string
  n?: number
  halfLife?: { value: number; unit: string } | "stable"
  family?: string
  cls?: string
  energyKeV?: number
  jpi?: string
  pos?: { x: number; y: number }
  faint?: boolean
  /** The transmutation figure: the share of absorptions that end in fission, printed under the glyph. */
  fissionPct?: number
}

export interface DiagramEdge {
  s: string
  t: string
  kind: EdgeKind
  pct?: number
  label?: string
  curve?: boolean
}

export interface DiagramSpec {
  id: string
  title: string
  kind: DiagramKind
  subtype: string
  source: string
  defaults: DiagramConfig
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  legend?: { label: string; color: string }[]
  bands?: { label: string; key: number }[]
}

export const KINDS: DiagramKind[] = [
  "decay-chain",
  "reaction-network",
  "activation-burnup",
  "production-route",
  "fission-fan",
  "level-scheme",
]

export const KIND_LABEL: Record<DiagramKind, string> = {
  "decay-chain": "Decay chains",
  "reaction-network": "Reaction networks",
  "activation-burnup": "Activation and burnup",
  "production-route": "Production routes",
  "fission-fan": "Fission fan / yield curve",
  "level-scheme": "Level schemes",
}

export const SUBTYPES: Record<DiagramKind, string[]> = {
  "decay-chain": ["thorium-series", "neptunium-series", "uranium-series", "actinium-series", "single-chain"],
  "reaction-network": ["s-process", "r-process", "rp-process", "capture-chain"],
  "activation-burnup": ["transmutation-flow", "breeding-chain"],
  "production-route": ["medical-isotope"],
  "fission-fan": ["fan"],
  "level-scheme": ["decay-scheme", "ladder"],
}

export const SUBTYPE_LABEL: Record<string, string> = {
  "thorium-series": "Thorium series",
  "neptunium-series": "Neptunium series",
  "uranium-series": "Uranium series",
  "actinium-series": "Actinium series",
  "single-chain": "Single chain",
  "s-process": "s-process",
  "r-process": "r-process",
  "rp-process": "rp-process",
  "capture-chain": "Capture chain",
  "transmutation-flow": "Transmutation flow",
  "breeding-chain": "Breeding chain",
  "medical-isotope": "Medical isotope",
  fan: "Fan",
  "decay-scheme": "Decay scheme",
  ladder: "Ladder",
}

export const SHAPES: NodeShape[] = ["disc", "square", "rect"]
export const GRIDS: GridKind[] = ["element-rows", "nz", "free", "ladder"]
export const EDGE_KINDS: EdgeKind[] = ["alpha", "beta-", "beta+", "ec", "it", "capture", "fission", "gamma", "sf"]
export const LABEL_FIELDS: LabelField[] = ["A", "Z", "symbol", "halflife", "jpi", "energy", "percent"]

export const EDGE_LABEL: Record<EdgeKind, string> = {
  alpha: "α",
  "beta-": "β−",
  "beta+": "β+",
  ec: "EC",
  it: "IT",
  capture: "(n,γ)",
  fission: "fission",
  gamma: "γ",
  sf: "SF",
}

const ALL_LABELS: LabelField[] = ["A", "Z", "symbol", "halflife", "percent"]

export const DEFAULTS_BY_KIND: Record<DiagramKind, DiagramConfig> = {
  "decay-chain": {
    kind: "decay-chain",
    subtype: "single-chain",
    shape: "disc",
    grid: "element-rows",
    bands: true,
    legend: true,
    labels: ALL_LABELS,
    edges: ["alpha", "beta-", "beta+", "ec", "it", "sf"],
  },
  "reaction-network": {
    kind: "reaction-network",
    subtype: "s-process",
    shape: "square",
    grid: "nz",
    bands: false,
    legend: true,
    labels: ["A", "symbol"],
    edges: ["capture", "beta-", "beta+", "ec", "alpha"],
  },
  "activation-burnup": {
    kind: "activation-burnup",
    subtype: "transmutation-flow",
    shape: "rect",
    grid: "free",
    bands: false,
    legend: true,
    labels: ALL_LABELS,
    edges: ["capture", "alpha", "beta-", "beta+", "ec", "it", "fission"],
  },
  "production-route": {
    kind: "production-route",
    subtype: "medical-isotope",
    shape: "rect",
    grid: "free",
    bands: false,
    legend: false,
    labels: ALL_LABELS,
    edges: ["capture", "beta-", "beta+", "ec", "it", "gamma", "fission"],
  },
  "fission-fan": {
    kind: "fission-fan",
    subtype: "fan",
    shape: "rect",
    grid: "free",
    bands: false,
    legend: false,
    labels: ALL_LABELS,
    edges: ["capture", "fission", "beta-"],
  },
  "level-scheme": {
    kind: "level-scheme",
    subtype: "decay-scheme",
    shape: "rect",
    grid: "ladder",
    bands: false,
    legend: false,
    labels: ["symbol", "halflife", "jpi", "energy", "percent"],
    edges: ["beta-", "beta+", "ec", "gamma", "it"],
  },
}

// The section of the catalog a kind belongs to, and the config a spec opens with: the spec's own defaults over its kind's.
export function configFor(spec: DiagramSpec): DiagramConfig {
  return { ...DEFAULTS_BY_KIND[spec.kind], ...spec.defaults, kind: spec.kind, subtype: spec.subtype }
}
