// Production routes and the fission fan (brief 28): the Mo-99/Tc-99m and Lu-177 routes and the U-235 thermal fission
// fan, as free cards. Values are the earlier demos' (ENSDF branchings, ENDF thermal cross sections, JEFF cumulative
// yields); half-lives and families are filled from decay.json when the spec loads (library/index.ts).
import { DEFAULTS_BY_KIND, type DiagramEdge, type DiagramNode, type DiagramSpec, type EdgeKind } from "../spec"

const n = (id: string, z: number, a: number, symbol: string, x: number, y: number): DiagramNode => ({ id, z, a, symbol, pos: { x, y } })
const e = (s: string, t: string, kind: EdgeKind, pct?: number, label?: string): DiagramEdge => ({ s, t, kind, pct, label })

const FAN: [string, number, number, string, number, [string, number, number, string][]][] = [
  // product, its yield %, then its decay chain to stable
  ["137CS", 55, 137, "Cs", 6.2, [["137BAM", 56, 137, "Ba"], ["137BA", 56, 137, "Ba"]]],
  ["90SR", 38, 90, "Sr", 5.8, [["90Y", 39, 90, "Y"], ["90ZR", 40, 90, "Zr"]]],
  ["131I", 53, 131, "I", 2.9, [["131XE", 54, 131, "Xe"]]],
  ["133XE", 54, 133, "Xe", 6.7, [["133CS", 55, 133, "Cs"]]],
  ["140BA", 56, 140, "Ba", 6.2, [["140LA", 57, 140, "La"], ["140CE", 58, 140, "Ce"]]],
  ["95ZR", 40, 95, "Zr", 6.5, [["95NB", 41, 95, "Nb"], ["95MO", 42, 95, "Mo"]]],
  ["99MO", 42, 99, "Mo", 6.1, [["99TC", 43, 99, "Tc"]]],
  ["144CE", 58, 144, "Ce", 5.5, [["144PR", 59, 144, "Pr"], ["144ND", 60, 144, "Nd"]]],
]
const fanNodes: DiagramNode[] = [n("235U", 92, 235, "U", 0, 3.5)]
const fanEdges: DiagramEdge[] = []
FAN.forEach(([id, z, a, sym, y, chain], row) => {
  fanNodes.push(n(id, z, a, sym, 1.2, row))
  fanEdges.push(e("235U", id, "fission", y, `(n,f) ${y}%`))
  let prev = id
  chain.forEach(([cid, cz, ca, csym], i) => {
    fanNodes.push(n(cid, cz, ca, csym, 2.2 + i, row))
    fanEdges.push(e(prev, cid, cid === "137BA" ? "it" : "beta-", cid === "137BAM" ? 94.7 : 100))
    prev = cid
  })
})

export const ROUTE_SPECS: DiagramSpec[] = [
  { id: "mo99-tc99m", title: "Mo-99 and Tc-99m", kind: "production-route", subtype: "medical-isotope", source: "https://en.wikipedia.org/wiki/Technetium-99m",
    defaults: { ...DEFAULTS_BY_KIND["production-route"] },
    nodes: [n("235U", 92, 235, "U", 0, 0), n("98MO", 42, 98, "Mo", 0, 1), n("100MO", 42, 100, "Mo", 0, 2), n("99MO", 42, 99, "Mo", 1.2, 1),
      n("99TCM", 43, 99, "Tc", 2.4, 0.4), n("99TC", 43, 99, "Tc", 2.4, 1.6), n("99RU", 44, 99, "Ru", 3.6, 1.6)],
    edges: [e("235U", "99MO", "fission", 6.1, "(n,f) 6.1% yield"), e("98MO", "99MO", "capture", undefined, "(n,γ) 0.13 b"), e("100MO", "99MO", "capture", undefined, "(γ,n)"),
      e("99MO", "99TCM", "beta-", 87.6), e("99MO", "99TC", "beta-", 12.4), e("99TCM", "99TC", "it", 99.996), e("99TC", "99RU", "beta-", 100)] },
  { id: "lu177", title: "Lu-177, two routes", kind: "production-route", subtype: "medical-isotope", source: "https://en.wikipedia.org/wiki/Lutetium-177",
    defaults: { ...DEFAULTS_BY_KIND["production-route"] },
    nodes: [n("176LU", 71, 176, "Lu", 0, 0), n("176YB", 70, 176, "Yb", 0, 1.4), n("177YB", 70, 177, "Yb", 1.2, 1.4), n("177LU", 71, 177, "Lu", 2.4, 0.7), n("177HF", 72, 177, "Hf", 3.6, 0.7)],
    edges: [e("176LU", "177LU", "capture", undefined, "(n,γ) 2,090 b, direct"), e("176YB", "177YB", "capture", undefined, "(n,γ) 2.85 b, carrier-free"),
      e("177YB", "177LU", "beta-", 100), e("177LU", "177HF", "beta-", 100)] },
  { id: "u235-fan", title: "U-235 thermal fission, top products", kind: "fission-fan", subtype: "fan", source: "https://en.wikipedia.org/wiki/Fission_product_yield",
    defaults: { ...DEFAULTS_BY_KIND["fission-fan"] }, nodes: fanNodes, edges: fanEdges },
]
