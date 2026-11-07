import { currentUser } from "@/lib/auth"
import { athenaQuery, lit } from "@/lib/chat-data/athena"

// One NSR record with its Semantic Scholar enrichment (2026-11-07), from the lake through Athena
// (database nsr, New account): GET ?id=<nsr id> or ?key=<key number>. The record drawer on /search.
const COLS = `id, key_number, pub_year, reference, authors, title, doi, exfor_keys, keywords,
  nuclides, reactions, subjects, topics, reference_type, is_nsr,
  s2_paper_id, citation_count, influential_citation_count, reference_count, abstract, tldr, venue,
  publication_date, is_open_access, open_access_pdf_url, fields_of_study, s2_authors, s2_lookup_status, s2_looked_up_at`

export async function GET(req: Request) {
  if (!(await currentUser())) return Response.json({ error: "Sign in." }, { status: 401 })
  const p = new URL(req.url).searchParams
  const id = p.get("id")
  const key = p.get("key")
  const where = id && /^\d+$/.test(id) ? `id = ${id}` : key && /^[\w-]{4,24}$/.test(key) ? `key_number = ${lit(key)}` : null
  if (!where) return Response.json({ error: "id or key required" }, { status: 400 })
  try {
    const { rows } = await athenaQuery(`SELECT ${COLS} FROM nsr WHERE ${where} LIMIT 1`, { maxRows: 1, timeoutMs: 20_000 })
    const r = rows[0]
    if (!r) return Response.json({ error: "not found" }, { status: 404 })
    if (typeof r.s2_authors === "string") {
      try { r.s2_authors = JSON.parse(r.s2_authors) } catch { r.s2_authors = null }
    }
    return Response.json(r, { headers: { "Cache-Control": "private, max-age=1800" } })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}

// The old app saved a reader's abstract to its database; NSRgpt holds no writable record store.
export async function PATCH() {
  return Response.json({ error: "Saving an abstract isn't available." }, { status: 501 })
}
