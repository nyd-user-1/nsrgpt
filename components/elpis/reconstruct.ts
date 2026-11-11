"use client"
// /elpis/book (brief 69 follow-up): PREPRO's reconstruction of one release's File 3 where it is only the background,
// through the Lab's job proxy (app/api/jobs/route.ts → Lambda nsr-jobs, services/nsr-jobs/README.md): a broaden job
// (linear, recent, sigma1) at one temperature, polled every 3 s, its curve read from GET /jobs/{id}/result?temp_k=.
// The runner answers a job it already holds or has done (same release, material, sub, MT, temperature) with that job,
// so a second reader waits for nothing. PREPRO broadens to a temperature above 0 K, so the book's 0 K asks for 1 K.
// A job can start the job box, so the proxy takes it from a signed-in reader only.
import { apiUrl } from "@/lib/api-url"
import type { BookLine } from "@/components/elpis/use-book"

/** The releases nsr-jobs reconstructs (its README's list). */
export const JOB_RELEASES = new Set(["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"])
/** The MTs File 2's resonances add to, unless the range is R-matrix limited (LRF 7), whose channels can be any. */
export const RES_MTS = new Set([1, 2, 3, 18, 19, 27, 101, 102])

type Job = { id: string; status: "queued" | "running" | "done" | "failed"; started_at?: string; error?: string }

/** A long curve thinned for charting as the API thins the POINT files: in each of `steps` equal log-energy steps, the
 *  lowest and the highest point, in energy order (a log axis wants detail spread by decade, not by index). */
export function thinLog(x: number[], y: number[], steps = 4000): { x: number[]; y: number[] } {
  if (x.length <= steps * 2) return { x, y }
  const lo = Math.log(Math.max(x[0], 1e-12)), span = Math.log(x[x.length - 1]) - lo || 1
  const ox: number[] = [], oy: number[] = []
  let bin = -1, iMin = -1, iMax = -1
  const flush = () => {
    if (iMin < 0) return
    for (const i of iMin === iMax ? [iMin] : iMin < iMax ? [iMin, iMax] : [iMax, iMin]) { ox.push(x[i]); oy.push(y[i]) }
  }
  for (let i = 0; i < x.length; i++) {
    const b = Math.min(steps - 1, Math.floor(((Math.log(Math.max(x[i], 1e-12)) - lo) / span) * steps))
    if (b !== bin) { flush(); bin = b; iMin = iMax = i; continue }
    if (y[i] < y[iMin]) iMin = i
    if (y[i] > y[iMax]) iMax = i
  }
  flush()
  return { x: ox, y: oy }
}
const done = new Map<string, Promise<BookLine>>()

async function jobJson(r: Response): Promise<Job> {
  const j = (await r.json().catch(() => ({}))) as Job & { job?: Job; error?: string }
  if (!r.ok) throw new Error(j.error ?? `the job runner answered ${r.status}`)
  return j.job ?? j
}

/** One release's reconstructed line; `report` hears "queued", "running 12 s". Shared by every caller asking the same. */
export function reconstruct(o: { release: string; name: string; mt: number; tempK: number }, report: (s: string) => void): Promise<BookLine> {
  const t = o.tempK > 0 ? o.tempK : 1
  const key = JSON.stringify({ ...o, tempK: t })
  if (!done.has(key)) {
    const p = (async () => {
      const body = { kind: "broaden", params: { release: o.release, name: o.name, sub: "neutrons", mt: o.mt, temps_k: [t] } }
      let job = await jobJson(await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
      const t0 = Date.now()
      let misses = 0
      while (job.status !== "done") {
        if (job.status === "failed") throw new Error(job.error ?? "the job failed")
        if (Date.now() - t0 > 15 * 60_000) throw new Error("no answer after 15 minutes")
        const since = job.started_at ? Date.parse(job.started_at) : t0
        report(job.status === "running" ? `running ${Math.max(0, Math.round((Date.now() - since) / 1000))} s` : "queued")
        await new Promise((r) => setTimeout(r, 3000 + misses * 2000))
        // A busy proxy (429, 5xx) is waited out, five times in a row at most.
        try {
          job = await jobJson(await fetch(`/api/jobs?id=${encodeURIComponent(job.id)}`))
          misses = 0
        } catch (e) {
          if (++misses > 5) throw e
        }
      }
      const r = await fetch(apiUrl(`/jobs/${job.id}/result?temp_k=${t}`))
      const j = (await r.json().catch(() => ({}))) as { energy_ev?: number[]; xs_barn?: number[]; error?: string; method?: string }
      if (!r.ok || !j.energy_ev?.length || !j.xs_barn?.length) throw new Error(j.error ?? `the result answered ${r.status}`)
      const thin = thinLog(j.energy_ev, j.xs_barn)
      const cut = thin.x.length < j.energy_ev.length ? `; thinned for charting to ${thin.x.length.toLocaleString("en-US")} of ${j.energy_ev.length.toLocaleString("en-US")} points` : ""
      return { release: o.release, x: thin.x, y: thin.y, n: j.energy_ev.length, served: "PREPRO", note: `reconstructed with PREPRO at ${t} K (job ${job.id})${cut}` }
    })()
    done.set(key, p)
    p.catch(() => done.delete(key))
  }
  return done.get(key)!
}
