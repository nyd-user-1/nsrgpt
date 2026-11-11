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
      while (job.status !== "done") {
        if (job.status === "failed") throw new Error(job.error ?? "the job failed")
        if (Date.now() - t0 > 15 * 60_000) throw new Error("no answer after 15 minutes")
        const since = job.started_at ? Date.parse(job.started_at) : t0
        report(job.status === "running" ? `running ${Math.max(0, Math.round((Date.now() - since) / 1000))} s` : "queued")
        await new Promise((r) => setTimeout(r, 3000))
        job = await jobJson(await fetch(`/api/jobs?id=${encodeURIComponent(job.id)}`))
      }
      const r = await fetch(apiUrl(`/jobs/${job.id}/result?temp_k=${t}`))
      const j = (await r.json().catch(() => ({}))) as { energy_ev?: number[]; xs_barn?: number[]; error?: string; method?: string }
      if (!r.ok || !j.energy_ev?.length || !j.xs_barn?.length) throw new Error(j.error ?? `the result answered ${r.status}`)
      return { release: o.release, x: j.energy_ev, y: j.xs_barn, n: j.energy_ev.length, served: "PREPRO", note: `reconstructed with PREPRO at ${t} K (job ${job.id})` }
    })()
    done.set(key, p)
    p.catch(() => done.delete(key))
  }
  return done.get(key)!
}
