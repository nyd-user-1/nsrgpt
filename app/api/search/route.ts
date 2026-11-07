import { currentUser } from "@/lib/auth"
import { searchRecords, wakeSearch } from "@/lib/nsr-search"

// /search's records (2026-11-07), from the NSR search service on Lambda (lib/nsr-search.ts):
// GET ?q=…&mode=hybrid|semantic|keyword&limit=100 → { records, count, mode, timings }, for a signed-in reader.
// POST {wake: true} starts the service loading (the chat and search pages send it on open).
export async function GET(req: Request) {
  if (!(await currentUser())) return Response.json({ error: "Sign in to search." }, { status: 401 })
  const p = new URL(req.url).searchParams
  const q = (p.get("q") ?? "").trim().slice(0, 500)
  if (q.length < 2) return Response.json({ error: "q required" }, { status: 400 })
  const m = p.get("mode")
  const mode = m === "semantic" || m === "keyword" ? m : "hybrid"
  const limit = Math.min(Math.max(Number(p.get("limit")) || 100, 1), 100)
  const t0 = Date.now()
  try {
    const records = await searchRecords(q, mode, limit)
    return Response.json({ records, count: records.length, mode, timings: { total_ms: Date.now() - t0 } })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 })
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wake?: boolean }
  if (body.wake) await wakeSearch()
  return new Response(null, { status: 204 })
}
