import { seriesList, type Dataset, type KindDef } from "@/lib/lab/blocks"
import { compareOutputs, type WindowSummary } from "@/lib/lab/canvases/compare"

// Compare (brief 52): measured points against one or more evaluations, in log bins, with the evaluation's MF33 band.
// The arithmetic is lib/lab/canvases/compare.ts (window-2-ui-layer, brief 53), shared with the default canvas. Pure client
// code. Points come as the EXFOR dataset (`points`) or as curves (`data`).

export type CompareParams = { binsPerDecade: number; emin: number; emax: number; highlight?: [number, number] }

export const compare: KindDef<CompareParams> = {
  kind: "compare",
  title: "Compare",
  inputs: { points: "dataset", data: "series", evaluations: "series", band: "dataset" },
  outputs: { bins: "dataset", ratio: "series" },
  defaults: { binsPerDecade: 20, emin: 1e3, emax: 2e5, highlight: [9e3, 1.8e4] },
  async run(p, inputs) {
    let points = inputs.points?.[0] as Dataset | undefined
    if (!points && inputs.data?.length) {
      const rows = inputs.data.flatMap(seriesList).flatMap((s) => s.x.map((x, i) => ({ dataset_id: String(s.meta?.dataset_id ?? s.name), e_ev: x, xs_b: s.y[i] })))
      points = { columns: ["dataset_id", "e_ev", "xs_b"], rows }
    }
    const evaluations = (inputs.evaluations ?? []).flatMap(seriesList)
    if (!points?.rows.length) throw new Error("Connect measured points (a dataset or a series).")
    if (!evaluations.length) throw new Error("Connect at least one evaluation series.")
    const { bins, ratio } = compareOutputs(points, evaluations, inputs.band?.[0] as Dataset | undefined, {
      perDecade: p.binsPerDecade || 20,
      emin: p.emin,
      emax: p.emax,
      highlight: p.highlight,
    })
    return { bins, ratio }
  },
  summary(o) {
    const w = ((o.bins as Dataset | undefined)?.meta?.window ?? []) as WindowSummary[]
    return w.map((x) => `${x.evaluation.split(" ")[0]} ${Number.isFinite(x.mean_ratio) ? (x.mean_ratio as number).toFixed(3) : "—"}`).join(" · ")
  },
}
