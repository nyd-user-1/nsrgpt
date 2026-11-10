import { signedInName, store, storeConfigured } from "@/lib/community"

// The Lab's job proxy (brief 52): the Process block's calls to Lambda nsr-jobs (brief 51) behind the same API Gateway as
// the store, with the write key server-side as app/api/community/route.ts holds it. POST starts a job (a signed-in reader
// only: a job can start the box); GET ?id= reads one. The runner answers a warm job done at once.

export const dynamic = "force-dynamic"

const ID = /^[A-Za-z0-9_-]{1,80}$/
const KINDS = new Set(["broaden", "gnds"])

const fail = (e: unknown) => Response.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })

export async function GET(req: Request) {
  if (!storeConfigured()) return Response.json({ error: "Jobs aren't set up on this server." }, { status: 503 })
  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!ID.test(id)) return Response.json({ error: "Give the job's id." }, { status: 400 })
  try {
    return Response.json(await store(`/jobs/${id}`), { headers: { "cache-control": "no-store" } })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: Request) {
  if (!storeConfigured()) return Response.json({ error: "Jobs aren't set up on this server." }, { status: 503 })
  const by = await signedInName()
  if (!by) return Response.json({ error: "Sign in to run a job." }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { kind?: string; params?: unknown } | null
  if (!body?.kind || !KINDS.has(body.kind) || typeof body.params !== "object" || body.params === null)
    return Response.json({ error: "A job needs a kind (broaden or gnds) and its params." }, { status: 400 })
  try {
    return Response.json(await store("/jobs", { method: "POST", body: { kind: body.kind, params: body.params, owner: by } }))
  } catch (e) {
    return fail(e)
  }
}
