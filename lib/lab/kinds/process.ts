import { seriesList, type KindDef, type RunContext, type Series } from "@/lib/lab/blocks"
import { describe, window } from "@/lib/lab/format"

// Process (brief 52): a job on the box through app/api/jobs/route.ts, the proxy to Lambda nsr-jobs (brief 51). Broaden:
// one job per release, PREPRO linear, recent and sigma1 at each temperature; the block polls every 3 s and shows each
// job's state; a warm result (the runner answers done at once) is read without waiting. Out: one series per release and
// temperature, named "<release> <T> K" with meta.release, so Compare and Plot match it to its covariance.
//
// One job per request (window-1-parser, 2026-11-09: a canvas reopening must not queue the same broadening again): the
// browser remembers the job it started for each request and reads it back unless it failed; a POST already on its way
// is shared, and once sent it isn't cancelled, so a block stopped or reopened mid-POST still learns the job's id.

export type ProcessParams = { op: "broaden"; name: string; mt: number; releases: string[]; temperatures: number[]; emin?: number; emax?: number }

type Job = { id: string; status: "queued" | "running" | "done" | "failed"; started_at?: string; error?: string; summary?: { series?: { temp_k: number }[] } }

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

const POLL_MS = 3000
const STARTED = "lab:jobs"
const posting = new Map<string, Promise<Job>>()

const remembered = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(STARTED) ?? "{}") as Record<string, string> } catch { return {} }
}
const remember = (key: string, id: string) => {
  try { localStorage.setItem(STARTED, JSON.stringify({ ...remembered(), [key]: id })) } catch {}
}

/** The job for a request: the one this browser started, unless it failed; else one POST, shared while it is on its way. */
async function jobFor(ctx: RunContext, body: object): Promise<Job> {
  const key = JSON.stringify(body)
  const known = remembered()[key]
  if (known) {
    try {
      const j = await jobJson(await ctx.jobs(`/${known}`, { signal: ctx.signal }))
      if (j.status !== "failed") return j
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e
    }
  }
  let p = posting.get(key)
  if (!p) {
    p = ctx.jobs("", { method: "POST", headers: { "content-type": "application/json" }, body: key, signal: null }).then(jobJson)
    posting.set(key, p)
    p.then((j) => remember(key, j.id), () => {}).finally(() => posting.delete(key))
  }
  return p
}

type Result = { mat?: number; n_points?: number; energy_ev?: number[]; xs_barn?: number[]; method?: string; error?: string }

const query = (o: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString()

async function broadenOne(p: ProcessParams, release: string, ctx: RunContext, report: (s: string) => void): Promise<Series[]> {
  const body = { kind: "broaden", params: { release, name: p.name, sub: "neutrons", mt: p.mt, temps_k: p.temperatures } }
  let job = await jobFor(ctx, body)
  if (ctx.signal.aborted) throw new DOMException("Stopped", "AbortError")
  const t0 = Date.now()
  while (job.status !== "done") {
    if (job.status === "failed") throw new Error(`${release}: ${job.error ?? "the job failed"}`)
    const since = job.started_at ? Date.parse(job.started_at) : t0
    report(job.status === "running" ? `running ${Math.max(0, Math.round((Date.now() - since) / 1000))} s` : "queued")
    await sleep(POLL_MS, ctx.signal)
    job = await jobJson(await ctx.jobs(`/${job.id}`, { signal: ctx.signal }))
  }
  report("done")
  // The arrays, one temperature at a time, cut to the block's window by the route (GET /jobs/{id}/result?temp_k=).
  const held = new Set(job.summary?.series?.map((s) => s.temp_k) ?? p.temperatures)
  const temps = p.temperatures.filter((t) => held.has(t))
  if (!temps.length) throw new Error(`${release}: the job holds ${[...held].join(", ")} K, not ${p.temperatures.join(", ")} K`)
  return Promise.all(
    temps.map(async (t) => {
      const r = await ctx.api(`/jobs/${job.id}/result?${query({ temp_k: t, emin: p.emin, emax: p.emax })}`)
      const j = (await r.json().catch(() => ({}))) as Result
      if (!r.ok) throw new Error(`${release} ${t} K: ${j.error ?? `the result answered ${r.status}`}`)
      return window(
        { name: `${release} ${t} K`, x: j.energy_ev ?? [], y: j.xs_barn ?? [], unit_x: "eV", unit_y: "b", meta: { release, temp_k: t, mat: j.mat, n_points: j.n_points, job: job.id, method: j.method } },
        p.emin,
        p.emax,
      )
    }),
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
  // PREPRO copies the unresolved resonance range (nsr-jobs' `method`): a curve there is the 0 K one, and the block says so.
  note: (o) => (seriesList(o.series).some((s) => /not broadened/i.test(String(s.meta?.method ?? ""))) ? "Unresolved resonance range copied, not broadened." : undefined),
  summary: (o) => describe(o.series),
}
