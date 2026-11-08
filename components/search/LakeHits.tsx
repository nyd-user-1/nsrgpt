"use client"

import { useQuery } from "@tanstack/react-query"
import { ExternalLink } from "lucide-react"
import { apiUrl, searchLake, type SearchHit } from "@/lib/api-url"

// Records across the lake (2026-11-08): the keyword index over every parsed dataset (EXFOR, ENSDF, XUNDL, ENDF/B, NSR),
// served by the cached API's /search. Shown under the search bar beside the NSR meaning search: the hits by type, each
// opening its API record until the app has a page for it.

const TYPE_LABEL: Record<string, string> = {
  nuclide: "Nuclides", level: "Levels", decay: "Decays", dataset: "ENSDF and XUNDL datasets", material: "ENDF materials",
  xs: "Cross sections", cross_section: "Cross sections", exfor_entry: "EXFOR entries", exfor_dataset: "EXFOR datasets", nsr: "NSR references",
}
const label = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, " ")

export function LakeHits({ q }: { q: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lake-search", q],
    queryFn: () => searchLake(q, 40),
    enabled: q.trim().length > 0,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
  if (!q.trim()) return null
  const hits = data?.hits ?? []
  const byType = new Map<string, SearchHit[]>()
  for (const h of hits) byType.set(h.type, [...(byType.get(h.type) ?? []), h])
  return (
    <section className="mb-5 rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--paper-text)]">Records across the lake</h2>
        <span className="text-xs text-[var(--paper-muted)]">
          {isLoading ? "Searching…" : error ? "The record search didn't answer." : data ? `${data.total.toLocaleString()} hits · ${data.took_ms} ms` : ""}
        </span>
      </div>
      {data && hits.length === 0 && <p className="mt-2 text-xs text-[var(--paper-muted)]">No record matches these words.</p>}
      {hits.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...byType.entries()].map(([type, list]) => (
            <div key={type}>
              <p className="text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">{label(type)} <span className="font-mono">{list.length}</span></p>
              <ul className="mt-1 space-y-1">
                {list.slice(0, 6).map((h) => (
                  <li key={`${h.type}:${h.id}`} className="text-xs leading-snug">
                    <a href={apiUrl(h.url_path)} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 text-[var(--paper-text)] hover:text-nuclear">
                      <span><span className="font-mono font-semibold">{h.name}</span>{h.title && h.title !== h.name ? <span className="text-[var(--paper-muted)]"> · {h.title}</span> : null}</span>
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
