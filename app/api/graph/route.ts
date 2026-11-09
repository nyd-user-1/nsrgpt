import { currentUser } from "@/lib/auth"
import { athenaQuery, lit } from "@/lib/chat-data/athena"
import { searchRecords, similarPapers } from "@/lib/nsr-search"

// /api/graph — entity search and neighborhood expansion for /graph's canvas, ported from the old nsr
// app's api/graph.ts (2026-11-07). Records come from the lake through Athena (database nsr); paper text
// search and "similar" come from the NSR search service on Lambda. Every edge is a record from the join
// tables, except similar, which is the encoder's inference.
//
//   ?op=search&q=…                          → typed entity matches
//   ?op=cards&ids=a,b,…                     → each paper's first authors / nuclides / reactions
//   ?op=node&type=paper&id=2024BA01        → node detail + neighbor counts
//   ?op=expand&type=author&id=123&rel=papers&offset=0 → one page of neighbors
//   ?op=similar&id=2024BA01                → the nearest papers in the NSR-CPT space
//
// Entity ids: paper=key_number · author=author_key · nuclide=nuclide_code ('137CS') ·
// reaction=reaction_code ('(N,G)') · exfor=exfor_id.

const LIMIT = 8
type Row = Record<string, unknown>

const q = async (sql: string, maxRows = 200): Promise<Row[]> => (await athenaQuery(sql, { maxRows, timeoutMs: 30_000 })).rows
const num = (v: unknown) => Number(v ?? 0)
const initcap = (col: string) => `concat(upper(substr(lower(${col}), 1, 1)), substr(lower(${col}), 2))`
// "60CO" -> "Co": the code's letters, so a nuclide reads "60Co", not "60Cobalt" (nuclide_dict.element is the full name).
const symbol = (code: unknown) => String(code ?? "").replace(/^\d+/, "").replace(/^(.)(.*)$/, (_, h: string, t: string) => h.toUpperCase() + t.toLowerCase())
const authorLabel = (r: Row) => `${r.initial1 ?? ""}${r.initial2 ? "." + r.initial2 : ""}.${r.last_name}`

const paperNode = (r: Row) => ({
  type: "paper",
  id: r.key_number,
  label: r.key_number,
  title: r.title,
  sub: `${r.pub_year}${r.citation_count ? ` · ${Number(r.citation_count).toLocaleString()} cites` : ""}`,
  meta: { doi: r.doi, year: r.pub_year, cites: r.citation_count, pdf: !!r.pdf_url, nsr: r.is_nsr },
})

const PAPER_COLS = `key_number, title, pub_year, doi, citation_count, pdf_url, is_nsr`
const json = (body: unknown, status = 200) => Response.json(body, { status })

export async function GET(req: Request) {
  if (!(await currentUser())) return json({ error: "Sign in." }, 401)
  const p = new URL(req.url).searchParams
  const op = p.get("op")
  const type = p.get("type")
  const id = p.get("id") ?? ""
  const rel = p.get("rel")
  const offset = Math.max(0, Number(p.get("offset") ?? 0) || 0)
  const page = `OFFSET ${offset} LIMIT ${LIMIT}`

  try {
    /* ── search ──────────────────────────────────────────────────────────── */
    if (op === "search") {
      const term = (p.get("q") ?? "").trim()
      if (term.length < 2) return json({ results: [] })
      const like = lit(term.replace(/[%_']/g, "").toLowerCase() + "%")
      const [nuclides, authors, papersByKey, papersByText, reactions] = await Promise.all([
        q(`SELECT nuclide_code, z, n, a, element FROM nuclide_dict WHERE lower(nuclide_code) LIKE ${like} ORDER BY a, z LIMIT 6`),
        q(`SELECT a.author_key, a.initial1, a.initial2, a.last_name, count(na.key_number) AS papers
           FROM authors a LEFT JOIN nsr_authors na ON na.author_key = a.author_key
           WHERE lower(a.last_name) LIKE ${like} GROUP BY 1, 2, 3, 4 ORDER BY papers DESC LIMIT 6`),
        q(`SELECT ${PAPER_COLS} FROM nsr WHERE key_number LIKE ${lit(term.replace(/[%_']/g, "").toUpperCase() + "%")} LIMIT 4`),
        searchRecords(term, "keyword", 4).catch(() => [] as Row[]),
        q(`SELECT reaction_code FROM reaction_dict WHERE lower(reaction_code) LIKE ${lit("(" + term.replace(/[%_']/g, "").toLowerCase() + "%")} ORDER BY reaction_code LIMIT 6`),
      ])
      const seen = new Set<string>()
      const papers = [...papersByKey, ...papersByText].filter((r) => {
        const k = String(r.key_number)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      return json({
        results: [
          ...nuclides.map((r) => ({ type: "nuclide", id: r.nuclide_code, label: `${r.a}${symbol(r.nuclide_code)}`, sub: `Z=${r.z} N=${r.n}` })),
          ...authors.map((r) => ({ type: "author", id: String(r.author_key), label: authorLabel(r), sub: `${r.papers} papers` })),
          ...papers.map(paperNode),
          ...reactions.map((r) => ({ type: "reaction", id: r.reaction_code, label: r.reaction_code, sub: "reaction" })),
        ],
      })
    }

    /* ── card rows: the inside of paper nodes, batched ───────────────────── */
    if (op === "cards") {
      const ids = (p.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[\w-]{4,24}$/.test(s)).slice(0, 24)
      if (!ids.length) return json({ cards: {} })
      const inIds = ids.map(lit).join(", ")
      const [authors, nuclides, reactions] = await Promise.all([
        q(`SELECT * FROM (
             SELECT na.key_number, cast(a.author_key AS varchar) AS id,
                    concat(coalesce(a.initial1, ''), '.', CASE WHEN coalesce(a.initial2, '') <> '' THEN a.initial2 || '.' ELSE '' END, a.last_name) AS label,
                    count(*) OVER (PARTITION BY na.key_number) AS total,
                    row_number() OVER (PARTITION BY na.key_number ORDER BY na.order_index NULLS LAST, a.author_key) AS rn
             FROM nsr_authors na JOIN authors a ON a.author_key = na.author_key
             WHERE na.key_number IN (${inIds})) x WHERE rn <= 4`, 500),
        q(`SELECT * FROM (
             SELECT nn.key_number,
                    concat(cast(nn.a AS varchar), upper(coalesce(nn.element_symbol, ''))) AS id,
                    concat(cast(nn.a AS varchar), ${initcap("coalesce(nn.element_symbol, '')")}) AS label,
                    count(*) OVER (PARTITION BY nn.key_number) AS total,
                    row_number() OVER (PARTITION BY nn.key_number ORDER BY min_sel NULLS LAST, nn.a) AS rn
             FROM (SELECT key_number, z, a, element_symbol, min(selector_index) AS min_sel
                   FROM nsr_nuclides WHERE key_number IN (${inIds}) AND a IS NOT NULL
                   GROUP BY 1, 2, 3, 4) nn) x WHERE rn <= 4`, 500),
        q(`SELECT * FROM (
             SELECT nr.key_number, nr.reaction_code AS id, nr.reaction_code AS label,
                    count(*) OVER (PARTITION BY nr.key_number) AS total,
                    row_number() OVER (PARTITION BY nr.key_number ORDER BY min_sel NULLS LAST, nr.reaction_code) AS rn
             FROM (SELECT key_number, reaction_code, min(selector_index) AS min_sel
                   FROM nsr_reactions WHERE key_number IN (${inIds}) AND reaction_code IS NOT NULL
                   GROUP BY 1, 2) nr) x WHERE rn <= 4`, 500),
      ])
      const cards: Record<string, Record<string, { items: { id: unknown; label: unknown }[]; total: number }>> = {}
      const put = (rows: Row[], group: string) => {
        for (const r of rows) {
          const k = String(r.key_number)
          cards[k] ??= {}
          cards[k][group] ??= { items: [], total: num(r.total) }
          cards[k][group].items.push({ id: r.id, label: r.label })
        }
      }
      put(authors, "authors")
      put(nuclides, "nuclides")
      put(reactions, "reactions")
      return json({ cards })
    }

    /* ── node detail + counts ────────────────────────────────────────────── */
    if (op === "node") {
      if (type === "paper") {
        const k = lit(id)
        const [rows, counts] = await Promise.all([
          q(`SELECT key_number, title, authors, pub_year, doi, reference, abstract, citation_count,
                    pdf_url, pdf_stored, is_nsr, entry_date, s2_looked_up_at, s2_lookup_status,
                    openalex_id, arxiv_id, oa_status, created_at, json_extract_scalar(raw, '$.source') AS ingest_source
             FROM nsr WHERE key_number = ${k}`, 1),
          q(`SELECT
               (SELECT count(*) FROM nsr_authors WHERE key_number = ${k}) AS authors,
               (SELECT count(*) FROM nsr_nuclides WHERE key_number = ${k}) AS nuclides,
               (SELECT count(*) FROM nsr_reactions WHERE key_number = ${k}) AS reactions,
               (SELECT count(*) FROM nsr_exfor WHERE key_number = ${k}) AS exfor`, 1),
        ])
        if (!rows[0]) return json({ error: "not found" }, 404)
        return json({ node: rows[0], counts: counts[0] })
      }
      if (type === "author") {
        if (!/^\d+$/.test(id)) return json({ error: "bad id" }, 400)
        const [a, c] = await Promise.all([
          q(`SELECT author_key, initial1, initial2, last_name FROM authors WHERE author_key = ${id}`, 1),
          q(`SELECT count(*) AS papers FROM nsr_authors WHERE author_key = ${id}`, 1),
        ])
        if (!a[0]) return json({ error: "not found" }, 404)
        return json({ node: a[0], counts: { papers: num(c[0]?.papers) } })
      }
      if (type === "nuclide") {
        const [d, c] = await Promise.all([
          q(`SELECT nuclide_code, z, n, a, element FROM nuclide_dict WHERE nuclide_code = ${lit(id)}`, 1),
          q(`SELECT count(DISTINCT j.key_number) AS papers FROM nsr_nuclides j
             JOIN nuclide_dict d ON d.z = j.z AND d.a = j.a WHERE d.nuclide_code = ${lit(id)}`, 1),
        ])
        if (!d[0]) return json({ error: "not found" }, 404)
        return json({ node: d[0], counts: { papers: num(c[0]?.papers) } })
      }
      if (type === "reaction") {
        const [d, c] = await Promise.all([
          q(`SELECT reaction_code, incident_particle, outgoing_particles, is_fission, delta_z, delta_n, delta_a
             FROM reaction_dict WHERE reaction_code = ${lit(id)}`, 1),
          q(`SELECT count(DISTINCT key_number) AS papers FROM nsr_reactions WHERE reaction_code = ${lit(id)}`, 1),
        ])
        return json({ node: d[0] ?? { reaction_code: id }, counts: { papers: num(c[0]?.papers) } })
      }
      if (type === "exfor") {
        const [d, c] = await Promise.all([
          q(`SELECT exfor_id, title, year, authors, reactions, num_subentries FROM exfor_entries WHERE exfor_id = ${lit(id)}`, 1),
          q(`SELECT count(*) AS papers FROM nsr_exfor WHERE exfor_id = ${lit(id)}`, 1),
        ])
        if (!d[0]) return json({ error: "not found" }, 404)
        return json({ node: d[0], counts: { papers: num(c[0]?.papers) } })
      }
      return json({ error: "unknown type" }, 400)
    }

    /* ── expand: one page of neighbors ───────────────────────────────────── */
    if (op === "expand") {
      const key = `${type}:${rel}`
      const k = lit(id)
      if (key === "author:papers") {
        if (!/^\d+$/.test(id)) return json({ error: "bad id" }, 400)
        const [rows, c] = await Promise.all([
          q(`SELECT n.key_number, n.title, n.pub_year, n.doi, n.citation_count, n.pdf_url, n.is_nsr FROM nsr n JOIN nsr_authors j ON j.key_number = n.key_number
             WHERE j.author_key = ${id} ORDER BY n.citation_count DESC NULLS LAST, n.pub_year DESC ${page}`),
          q(`SELECT count(*) AS c FROM nsr_authors WHERE author_key = ${id}`, 1),
        ])
        return json({ total: num(c[0]?.c), nodes: rows.map(paperNode) })
      }
      if (key === "paper:authors") {
        const [rows, c] = await Promise.all([
          q(`SELECT a.author_key, a.initial1, a.initial2, a.last_name, j.order_index
             FROM nsr_authors j JOIN authors a ON a.author_key = j.author_key
             WHERE j.key_number = ${k} ORDER BY j.order_index ${page}`),
          q(`SELECT count(*) AS c FROM nsr_authors WHERE key_number = ${k}`, 1),
        ])
        return json({ total: num(c[0]?.c), nodes: rows.map((r) => ({ type: "author", id: String(r.author_key), label: authorLabel(r), sub: "author" })) })
      }
      if (key === "paper:nuclides") {
        const [rows, c] = await Promise.all([
          q(`SELECT DISTINCT j.z, j.a, j.element_symbol, j.sub_type FROM nsr_nuclides j
             WHERE j.key_number = ${k} ORDER BY j.z, j.a ${page}`),
          q(`SELECT count(DISTINCT concat(cast(z AS varchar), '-', cast(a AS varchar))) AS c FROM nsr_nuclides WHERE key_number = ${k}`, 1),
        ])
        return json({
          total: num(c[0]?.c),
          nodes: rows.map((r) => ({ type: "nuclide", id: `${r.a}${String(r.element_symbol ?? "").toUpperCase()}`, label: `${r.a}${r.element_symbol}`, sub: `Z=${r.z}${r.sub_type ? " · " + String(r.sub_type).toLowerCase() : ""}` })),
        })
      }
      if (key === "paper:reactions") {
        const [rows, c] = await Promise.all([
          q(`SELECT DISTINCT reaction_code FROM nsr_reactions WHERE key_number = ${k} ORDER BY reaction_code ${page}`),
          q(`SELECT count(DISTINCT reaction_code) AS c FROM nsr_reactions WHERE key_number = ${k}`, 1),
        ])
        return json({ total: num(c[0]?.c), nodes: rows.map((r) => ({ type: "reaction", id: r.reaction_code, label: r.reaction_code, sub: "reaction" })) })
      }
      if (key === "paper:exfor") {
        const [rows, c] = await Promise.all([
          q(`SELECT e.exfor_id, e.title, e.year FROM nsr_exfor j JOIN exfor_entries e ON e.exfor_id = j.exfor_id
             WHERE j.key_number = ${k} ORDER BY e.year DESC NULLS LAST ${page}`),
          q(`SELECT count(*) AS c FROM nsr_exfor WHERE key_number = ${k}`, 1),
        ])
        return json({ total: num(c[0]?.c), nodes: rows.map((r) => ({ type: "exfor", id: r.exfor_id, label: String(r.exfor_id), sub: `EXFOR${r.year ? " · " + r.year : ""}`, title: r.title })) })
      }
      if (key === "nuclide:papers") {
        const d = await q(`SELECT z, a FROM nuclide_dict WHERE nuclide_code = ${k}`, 1)
        if (!d[0]) return json({ error: "unknown nuclide" }, 404)
        const za = `z = ${num(d[0].z)} AND a = ${num(d[0].a)}`
        const [rows, c] = await Promise.all([
          q(`SELECT ${PAPER_COLS} FROM nsr WHERE key_number IN (SELECT key_number FROM nsr_nuclides WHERE ${za})
             ORDER BY citation_count DESC NULLS LAST, pub_year DESC ${page}`),
          q(`SELECT count(DISTINCT key_number) AS c FROM nsr_nuclides WHERE ${za}`, 1),
        ])
        return json({ total: num(c[0]?.c), nodes: rows.map(paperNode) })
      }
      if (key === "reaction:papers") {
        const [rows, c] = await Promise.all([
          q(`SELECT ${PAPER_COLS} FROM nsr WHERE key_number IN (SELECT key_number FROM nsr_reactions WHERE reaction_code = ${k})
             ORDER BY citation_count DESC NULLS LAST, pub_year DESC ${page}`),
          q(`SELECT count(DISTINCT key_number) AS c FROM nsr_reactions WHERE reaction_code = ${k}`, 1),
        ])
        return json({ total: num(c[0]?.c), nodes: rows.map(paperNode) })
      }
      if (key === "exfor:papers") {
        const [rows, c] = await Promise.all([
          q(`SELECT n.key_number, n.title, n.pub_year, n.doi, n.citation_count, n.pdf_url, n.is_nsr FROM nsr n JOIN nsr_exfor j ON j.key_number = n.key_number
             WHERE j.exfor_id = ${k} ORDER BY n.pub_year DESC ${page}`),
          q(`SELECT count(*) AS c FROM nsr_exfor WHERE exfor_id = ${k}`, 1),
        ])
        return json({ total: num(c[0]?.c), nodes: rows.map(paperNode) })
      }
      return json({ error: `unknown expansion ${key}` }, 400)
    }

    /* ── similar: nearest papers in the NSR-CPT space (an inference, drawn dashed) ── */
    if (op === "similar") {
      const k = Math.min(8, Math.max(1, Number(p.get("k") ?? 6) || 6))
      const rows = await similarPapers(id, k)
      if (!rows.length) return json({ model: "nsr-encoder-bge-m3", nodes: [], reason: "no embedding for this paper" })
      return json({ model: "nsr-encoder-bge-m3", nodes: rows.map((r) => ({ ...paperNode(r), cos: Number(r.similarity) })) })
    }

    return json({ error: "unknown op" }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
}
