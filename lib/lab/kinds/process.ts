import type { KindDef, RunContext, Series } from "@/lib/lab/blocks"
import { describe, window } from "@/lib/lab/format"

// Process (brief 52): a job on the box through app/api/jobs/route.ts, the proxy to Lambda nsr-jobs (brief 51). Broaden:
// one job per release, PREPRO linear, recent and sigma1 at each temperature; the block polls every 2 s and shows each
// job's state; a warm result (the runner answers done at once) is read without waiting. Out: one series per release and
// temperature, named "<release> <T> K" with meta.release, so Compare and Plot match it to its covariance.

export type ProcessParams = { op: "broaden"; name: string; mt: number; releases: string[]; temperatures: number[]; emin?: number; emax?: number }

type Job = { id: string; status: "queued" | "running" | "done" | "failed"; started_at?: string; result_url?: string; error?: string }
type Curve = { temp_k?: number; energy_ev?: number[]; xs_barn?: number[]; mat?: number }

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms)
    signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Stopped", "AbortError")) }, { once: true })
  })

async function jobJson(r: Response): Promise<Job> {
  const j = (await r.json().catch(() => ({}))) as Job & { job?: Job; error?: string }
  if (!r.ok) throw new Error(j.error ?? `the job runner answered ${r.status}`)
  return j.job ?? j
}

/** The runner's result file as curves, whichever way it lists the temperatures. */
function curvesOf(result: unknown): Curve[] {
  const r = result as Record<string, unknown>
  if (Array.isArray(result)) return result as Curve[]
  for (const k of ["results", "temps", "series", "curves"]) if (Array.isArray(r[k])) return r[k] as Curve[]
  return [r as Curve]
}

async function broadenOne(p: ProcessParams, release: string, ctx: RunContext, report: (s: string) => void): Promise<Series[]> {
  const body = { kind: "broaden", params: { release, name: p.name, sub: "neutrons", mt: p.mt, temps_k: p.temperatures } }
  let job = await jobJson(await ctx.jobs("", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctx.signal }))
  const t0 = Date.now()
  while (job.status !== "done") {
    if (job.status === "failed") throw new Error(`${release}: ${job.error ?? "the job failed"}`)
    const since = job.started_at ? Date.parse(job.started_at) : t0
    report(job.status === "running" ? `running ${Math.max(0, Math.round((Date.now() - since) / 1000))} s` : "queued")
    await sleep(2000, ctx.signal)
    job = await jobJson(await ctx.jobs(`/${job.id}`, { signal: ctx.signal }))
  }
  report("done")
  if (!job.result_url) throw new Error(`${release}: the job finished without a result`)
  const r = await fetch(job.result_url, { signal: ctx.signal })
  if (!r.ok) throw new Error(`${release}: the result answered ${r.status}`)
  return curvesOf(await r.json()).map((c, i) =>
    window(
      {
        name: `${release} ${c.temp_k ?? p.temperatures[i] ?? "?"} K`,
        x: c.energy_ev ?? [],
        y: c.xs_barn ?? [],
        unit_x: "eV",
        unit_y: "b",
        meta: { release, temp_k: c.temp_k ?? p.temperatures[i], mat: c.mat, job: job.id },
      },
      p.emin,
      p.emax,
    ),
  )
}

export const process: KindDef<ProcessParams> = {
  kind: "process",
  title: "Process",
  inputs: {},
  outputs: { series: "series" },
  defaults: { op: "broaden", name: "U-235", mt: 18, releases: ["B-VIII.1"], temperatures: [300], emin: 1e3, emax: 2e5 },
  async run(p, _inputs, ctx) {
    if (!p.releases?.length) throw new Error("Pick at least one release.")
    if (!p.temperatures?.length) throw new Error("Give at least one temperature.")
    const lines = new Map(p.releases.map((r) => [r, "queued"]))
    const report = (release: string) => (s: string) => {
      lines.set(release, s)
      ctx.progress([...lines].map(([r, v]) => `${r} ${v}`).join(" · "))
    }
    const all = await Promise.all(p.releases.map((r) => broadenOne(p, r, ctx, report(r))))
    return { series: all.flat() }
  },
  summary: (o) => describe(o.series),
}
