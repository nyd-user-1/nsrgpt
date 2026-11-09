'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, EllipsisVertical, Map as MapIcon, Network, Search, Table2 } from 'lucide-react'
import { KebabMenu, MenuRow } from '@/components/kebab-menu'
import { usePaperTheme } from '@/lib/use-paper-theme'
import { ageBucket, ageColor, ageLabel, chainHref, datasetsHref, parseMassQuery, type StructureIndex } from '@/lib/structure'

// The ENSDF evaluation index (brief 35, 2026-11-09), ported whole from the old nsr app's src/pages/ensdf/Evaluation.tsx:
// one row per mass chain with its evaluation's citation, evaluators, literature cutoff and the XUNDL sets compiled
// since, and beneath each chain the nuclides evaluated on their own since. A filter (a mass, a nuclide, a citation),
// row selection, a menu per row, and a count footer. Citations that resolve to one NSR paper open it in the graph.
// A chain's mass opens it on the chart, framed on its mass; its menu also opens the chain's datasets (brief 33's index).

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const TH = 'sticky top-0 z-10 border-b border-[var(--paper-rule)]/25 bg-[var(--paper)] px-3 py-2 text-[10px] font-normal uppercase tracking-[0.14em] text-[var(--paper-faint)]'
const ROW_BTN = 'flex h-7 w-7 items-center justify-center rounded-md text-[var(--paper-faint)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]'

/** "GD" → "Gd". */
const el = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

function CutoffCell({ cutoff, b, dark }: { cutoff: string | null; b: number; dark: boolean }) {
  return (
    <td className="hidden px-3 py-2 sm:table-cell">
      <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: ageColor(b, dark) }} />
      <span className="text-[var(--paper-muted)]">{cutoff ?? '—'}</span>
      <span className="ml-1.5 text-xs text-[var(--paper-faint)]">({ageLabel(b)})</span>
    </td>
  )
}

function Citation({ citation, cite, authors, className }: { citation: string | null; cite?: string | null; authors?: string | null; className: string }) {
  if (!citation) return <td className={className}>—</td>
  return (
    <td className={className}>
      {cite ? (
        <Link href={`/graph?center=paper:${cite}`} className="underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]" title={`Open ${cite} in the graph`}>
          {citation}
        </Link>
      ) : (
        citation
      )}
      {authors && <span className="block truncate text-[11px] font-normal text-[var(--paper-faint)]" title={authors}>{authors}</span>}
    </td>
  )
}

export function EvaluationIndex({ data, onShowChain }: { data: StructureIndex; onShowChain: (a: number) => void }) {
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)
  const { dark } = usePaperTheme(root)
  const masses = data.masses
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return masses
    const a = parseMassQuery(s)
    return masses.filter((m) => {
      if (a !== null) return m.a === a
      return (
        (m.citation ?? '').toLowerCase().includes(s) ||
        (m.authors ?? '').toLowerCase().includes(s) ||
        m.nuclideEvals.some((n) => n.el.toLowerCase() === s || `${m.a}${n.el}`.toLowerCase().includes(s) || (n.citation ?? '').toLowerCase().includes(s))
      )
    })
  }, [masses, q])

  // Every selectable row key in view: the chain ("148") and its nuclides ("148Gd").
  const visibleKeys = useMemo(() => filtered.flatMap((m) => [String(m.a), ...m.nuclideEvals.map((n) => `${m.a}${n.el}`)]), [filtered])
  const allChecked = visibleKeys.length > 0 && visibleKeys.every((k) => sel.has(k))
  const toggleRow = (k: string) => setSel((prev) => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next })
  const toggleAll = () => setSel((prev) => { const next = new Set(prev); if (allChecked) visibleKeys.forEach((k) => next.delete(k)); else visibleKeys.forEach((k) => next.add(k)); return next })

  const nuclideCount = useMemo(() => filtered.reduce((s, m) => s + m.nuclideEvals.length, 0), [filtered])
  const checkbox = (k: string) => (
    <td className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" className="h-4 w-4 cursor-pointer align-middle accent-[var(--paper-text)]" checked={sel.has(k)} onChange={() => toggleRow(k)} />
    </td>
  )
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {})

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-1 pt-1 text-[13px] text-[var(--paper-text)]" style={SANS}>
      <p className="m-0 max-w-[900px] text-[13px] leading-relaxed text-[var(--paper-muted)]">
        For each mass chain the index gives the publication reference for the evaluation and its literature{' '}
        <span className="font-medium text-[var(--paper-text)]">cut-off date</span>, the date up to which the literature was
        surveyed. Measurements published after that date are not part of the evaluation; they appear instead as XUNDL
        compilations, counted in the last column. The dot runs from{' '}
        <span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: ageColor(0, dark) }} /> under a year
        through <span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: ageColor(5, dark) }} /> five to
        seven years to <span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: ageColor(11, dark) }} />{' '}
        ten years or more since cutoff. Nuclides evaluated on their own since their chain evaluation are listed underneath it.
        Citations I hold in the corpus link to the paper.
      </p>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--paper-rule)]/25">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--paper-rule)]/25 px-3 py-2.5">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter: a mass (137), a nuclide (137Cs), or a citation (NDS 106)…"
              className="h-8 w-full rounded-md border border-[var(--paper-rule)]/30 bg-transparent pl-9 pr-3 text-[13px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)] focus:border-[var(--paper-text)]"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed text-[13px]">
            <thead>
              <tr className="text-left">
                <th className={`${TH} w-10`}>
                  <input type="checkbox" title="Select all shown" className="h-4 w-4 cursor-pointer align-middle accent-[var(--paper-text)]" checked={allChecked} onChange={toggleAll} />
                </th>
                <th className={`${TH} w-[22%]`}>Mass / Nuclide</th>
                <th className={TH}>Citation</th>
                <th className={`${TH} hidden w-[26%] sm:table-cell`}>Cutoff</th>
                <th className={`${TH} w-[12%] text-right`}>XUNDL sets</th>
                <th className={`${TH} w-12 px-1`} />
              </tr>
            </thead>
            <tbody style={{ contentVisibility: 'auto' } as React.CSSProperties}>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-[var(--paper-muted)]">No chain matches “{q}”</td></tr>
              )}
              {filtered.flatMap((m) => [
                <tr key={`m-${m.a}`} className="border-b border-[var(--paper-rule-soft)]">
                  {checkbox(String(m.a))}
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onShowChain(m.a)} className="font-semibold hover:underline" style={MONO} title={`Show A = ${m.a} on the chart`}>
                      A = {m.a}
                    </button>
                  </td>
                  <Citation citation={m.citation} cite={m.key} authors={m.authors} className="px-3 py-2 font-medium" />
                  <CutoffCell cutoff={m.cutoff} b={ageBucket(m.cutoff, data.generated)} dark={dark} />
                  <td className="px-3 py-2 text-right tabular-nums" style={MONO}>{m.xundl_sets}</td>
                  <td className="w-12 px-1 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <KebabMenu label={`A = ${m.a} options`} width="w-56" trigger={<EllipsisVertical className="size-4" />} triggerClassName={ROW_BTN}>
                      <MenuRow icon={<MapIcon />} label="Show on the chart" onClick={() => onShowChain(m.a)} />
                      {chainHref(m.a) && <MenuRow icon={<Table2 />} label="Open mass chain" onClick={() => router.push(chainHref(m.a)!)} />}
                      {m.key && <MenuRow icon={<Network />} label="Open citation in graph" onClick={() => router.push(`/graph?center=paper:${m.key}`)} />}
                      {m.citation && <MenuRow icon={<Copy />} label="Copy citation" onClick={() => copy(m.citation!)} />}
                    </KebabMenu>
                  </td>
                </tr>,
                ...m.nuclideEvals.map((n) => (
                  <tr key={`n-${m.a}-${n.el}`} className="border-b border-[var(--paper-rule-soft)] bg-[var(--paper-quiet)]">
                    {checkbox(`${m.a}${n.el}`)}
                    <td className="py-1.5 pl-8 pr-3">
                      <Link href={datasetsHref(m.a, el(n.el))} className="text-xs hover:underline" style={MONO}>
                        <sup>{m.a}</sup>{el(n.el)}
                      </Link>
                    </td>
                    <Citation citation={n.citation} cite={n.key} authors={n.authors} className="px-3 py-1.5 text-xs text-[var(--paper-muted)]" />
                    <CutoffCell cutoff={n.cutoff} b={ageBucket(n.cutoff, data.generated)} dark={dark} />
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums" style={MONO}>{n.xundl_sets}</td>
                    <td className="w-12 px-1 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <KebabMenu label={`${m.a}${el(n.el)} options`} width="w-56" trigger={<EllipsisVertical className="size-4" />} triggerClassName={ROW_BTN}>
                        <MenuRow icon={<Table2 />} label="Open nuclide" onClick={() => router.push(datasetsHref(m.a, el(n.el)))} />
                        {n.key && <MenuRow icon={<Network />} label="Open citation in graph" onClick={() => router.push(`/graph?center=paper:${n.key}`)} />}
                        {n.citation && <MenuRow icon={<Copy />} label="Copy citation" onClick={() => copy(n.citation!)} />}
                      </KebabMenu>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--paper-rule)]/25 px-3 py-2 text-xs text-[var(--paper-muted)]">
          <span className="min-w-0 truncate">
            {filtered.length === 0 ? 'No chains match.' : `${filtered.length} mass chains · ${nuclideCount} nuclide evaluations`}
            {sel.size > 0 && ` · ${sel.size} selected`}
          </span>
          <span className="shrink-0">Source: NNDC</span>
        </div>
      </div>
    </div>
  )
}
