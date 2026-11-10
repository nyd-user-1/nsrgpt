import { apiUrl } from "@/lib/api-url"

// GNDS 2.0 files (brief 60): an ENDF/B material's precompiled pair from GET /gnds, or a gnds job through app/api/jobs
// (POST, then GET ?id= every 3 s) that compiles a material on demand, or an ENDF-6 file a reader uploads (Brendan,
// 2026-11-10: the file goes up through app/api/upload, the job takes its key). The wait reports as the Lab's Broaden
// reports it: "queued", "running N s".

export type GndsFiles = { url?: string; cov_url?: string | null }
type GndsJob = GndsFiles & { id?: string; status?: string; started_at?: string; error?: string }

/** An uploaded file to compile: one ENDF-6 material, up to this many bytes. */
export const GNDS_UPLOAD_MAX = 50 * 1024 * 1024

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Starts (or joins) a gnds job and waits for it. */
async function runJob(body: unknown, report: (s: string) => void): Promise<GndsFiles> {
  report("queued")
  const post = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  let job = (await post.json().catch(() => ({}))) as GndsJob
  if (!post.ok) throw new Error(post.status === 401 ? "sign in to compile (about 30 s)" : (job.error ?? `the job answered ${post.status}`))
  const t0 = Date.now()
  while (job.status !== "done") {
    if (job.status === "failed") throw new Error(job.error ?? "the compile failed")
    const since = job.started_at ? Date.parse(job.started_at) : t0
    report(job.status === "running" ? `running ${Math.max(0, Math.round((Date.now() - since) / 1000))} s` : "queued")
    await sleep(3000)
    const g = await fetch(`/api/jobs?id=${encodeURIComponent(job.id ?? "")}`, { cache: "no-store" })
    job = (await g.json().catch(() => ({}))) as GndsJob
    if (!g.ok) throw new Error(job.error ?? `the job answered ${g.status}`)
  }
  return job
}

/** A held material's files: the precompiled pair, else the job its 404 names. */
export async function gndsFiles(release: string, mat: string, sub: string, report: (s: string) => void): Promise<GndsFiles> {
  const r = await fetch(apiUrl(`/gnds?${new URLSearchParams({ release, mat, sub }).toString()}`))
  const first = (await r.json().catch(() => ({}))) as GndsFiles & { job?: unknown; error?: string }
  if (r.ok) return first
  if (r.status !== 404) throw new Error(first.error ?? `the API answered ${r.status}`)
  return runJob(first.job ?? { kind: "gnds", params: { release, mat: Number(mat), sub } }, report)
}

/** A reader's ENDF-6 file: up through app/api/upload (a signed-in reader, 50 MB at most), then a gnds job on its key. */
export async function compileUpload(file: File, report: (s: string) => void): Promise<GndsFiles> {
  if (file.size > GNDS_UPLOAD_MAX) throw new Error("files go up to 50 MB")
  report("uploading")
  const type = file.type || "text/plain"
  const r = await fetch(`/api/upload?${new URLSearchParams({ name: file.name, type }).toString()}`)
  const slot = (await r.json().catch(() => ({}))) as { key?: string; url?: string; error?: string }
  if (!r.ok || !slot.key || !slot.url) throw new Error(r.status === 401 ? "sign in to compile a file" : (slot.error ?? `the upload answered ${r.status}`))
  const put = await fetch(`${slot.url}&for=gnds`, { method: "PUT", headers: { "Content-Type": type }, body: file })
  const done = (await put.json().catch(() => ({}))) as { error?: string }
  if (!put.ok) throw new Error(done.error ?? `the upload answered ${put.status}`)
  return runJob({ kind: "gnds", params: { file_key: slot.key } }, report)
}
