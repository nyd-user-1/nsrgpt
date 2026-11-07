// /api/paper?doi=… — Semantic Scholar lookup for the chat footer, ported from the old nsr app's
// api/paper.ts (2026-11-07). Same PaperData shape (hooks/usePaperLookup.ts).
export async function GET(req: Request) {
  const doi = (new URL(req.url).searchParams.get("doi") ?? "").trim();
  if (!doi) return Response.json({ error: "doi required" }, { status: 400 });
  try {
    const headers: Record<string, string> = {};
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,abstract,authors,year,citationCount,venue,openAccessPdf`;
    let r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    // a rejected key (403) must not take the feature down — S2 serves DOI lookups keyless
    if (r.status === 403 && headers["x-api-key"]) r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return Response.json({ error: `s2 ${r.status}` }, { status: r.status === 404 ? 404 : 502 });
    const p = await r.json();
    return Response.json(
      {
        title: p.title ?? null, abstract: p.abstract ?? null,
        authors: (p.authors ?? []).map((a: { name: string }) => a.name),
        year: p.year ?? null, citationCount: p.citationCount ?? null, venue: p.venue ?? null,
        openAccessPdfUrl: p.openAccessPdf?.url ?? null, doi,
      },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
