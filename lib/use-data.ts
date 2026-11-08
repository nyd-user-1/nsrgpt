import { QueryClient, useQuery } from '@tanstack/react-query'
import { dataUrl } from '@/lib/data-url'

// Chart data's one cache (2026-11-08): every chart data file is fetched here, once per page load, keyed by its URL.
// Components read a file with useData; code outside a component (a chart's loader, a table's rows, a picker) reads
// the same entry with fetchData. Files are immutable inside a version (lib/data-url.ts), so nothing refetches.

const HOUR = 60 * 60 * 1000

let browserClient: QueryClient | undefined

/** The app's query client: one per server render, one for the browser tab's life. DataProvider mounts it. */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') return new QueryClient()
  return (browserClient ??= new QueryClient())
}

function dataQuery<T>(path: string) {
  const url = dataUrl(path)
  return {
    queryKey: ['data', url],
    queryFn: async (): Promise<T> => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`${url}: ${r.status}`)
      return r.json()
    },
    staleTime: Infinity,
    gcTime: HOUR,
    retry: 1,
  }
}

// A loader that reshapes its file (rows into objects, a lookup map) does it once per cached file, however many
// components and loaders ask: the result is kept against the file's parsed JSON.
const shaped = new WeakMap<object, Map<unknown, unknown>>()
function shape<R, T>(raw: R, select: (raw: R) => T): T {
  let byFn = shaped.get(raw as object)
  if (!byFn) shaped.set(raw as object, (byFn = new Map()))
  if (!byFn.has(select)) byFn.set(select, select(raw))
  return byFn.get(select) as T
}

/** One chart data file in a component: useData<Decay>('decay.json'). A null path waits; `select` reshapes it. */
export function useData<T, R = T>(path: string | null, opts?: { select?: (raw: R) => T }): { data: T | undefined; error: Error | null; loading: boolean } {
  const select = opts?.select
  const q = useQuery({
    ...dataQuery<R>(path ?? ''),
    enabled: path !== null,
    select: (raw: R): T => (select ? shape(raw, select) : (raw as unknown as T)),
  })
  return { data: q.data, error: q.error, loading: q.isLoading }
}

/** The same file and cache entry as a promise, for code outside a component (a chart's loader, a table's rows). */
export function fetchData<T, R = T>(path: string, select?: (raw: R) => T): Promise<T> {
  return getQueryClient()
    .fetchQuery(dataQuery<R>(path))
    .then((raw) => (select ? shape(raw, select) : (raw as unknown as T)))
}
