import { SEEDS } from "@/lib/community-seeds"
import { signedInName, store, storeConfigured } from "@/lib/community"

// Saved canvases, "views" and "recipes" (a recipe is a view with prompt steps). Since brief 34 they live in the store
// (DynamoDB nsrgpt-views behind Lambda nsr-api's /community, lib/community.ts); the seeds are rows in it, written by
// scripts/community/seed.mjs. Where the store isn't set up (no NSR_API_WRITE_KEY) the lists answer with the seeds and a
// save says so. A save is stamped server-side with the signed-in reader's name, whatever the page sends; a reader
// deletes only their own saves.

type View = { id: string; name: string; saved_by: string; created_at: string; kind?: string; state: unknown }

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const tab = params.get("tab")
  if (tab === "view") {
    const id = params.get("id") ?? ""
    if (storeConfigured() && /^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      try {
        return Response.json(await store<{ view: View }>(`/community/${id}`))
      } catch {
        // not in the store, or the store is down: try the seeds
      }
    }
    const view = SEEDS.find((s) => s.id === id)
    return view ? Response.json({ view }) : Response.json({ error: "not found" }, { status: 404 })
  }
  if (tab === "views") {
    if (storeConfigured()) {
      try {
        return Response.json(await store<{ views: View[] }>("/community"))
      } catch {
        // the store is down: the seeds keep the lists useful
      }
    }
    return Response.json({ views: SEEDS })
  }
  return Response.json({ views: [], issues: [], posts: [], threads: [] })
}

export async function POST(req: Request) {
  if (!storeConfigured()) return Response.json({ error: "Saving to Community isn't set up on this server." }, { status: 503 })
  const by = await signedInName()
  if (!by) return Response.json({ error: "Sign in to save to Community." }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { name?: string; state?: unknown } | null
  if (!body?.name?.trim() || typeof body.state !== "object" || body.state === null) return Response.json({ error: "A save needs a name and a canvas." }, { status: 400 })
  try {
    return Response.json(await store<{ view: View }>("/community", { method: "POST", body: { name: body.name.trim(), saved_by: by, state: body.state } }))
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}

export async function DELETE(req: Request) {
  if (!storeConfigured()) return Response.json({ error: "Community isn't set up on this server." }, { status: 503 })
  const by = await signedInName()
  if (!by) return Response.json({ error: "Sign in to delete a save." }, { status: 401 })
  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ error: "Give the save's id." }, { status: 400 })
  try {
    const { view } = await store<{ view: View }>(`/community/${id}`)
    if (view.saved_by !== by) return Response.json({ error: `Only ${view.saved_by} can delete this save.` }, { status: 403 })
    return Response.json(await store<{ deleted: string }>(`/community/${id}`, { method: "DELETE" }))
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}
