'use client'

// The right panel's Cloudflare view (2026-11-05): one bar per resource. The filled part is what's left;
// the empty part is what's been used. Live numbers come from /api/cloudflare; the per-deploy ones from
// /build-usage.json, which the deploy workflow writes after each build.

import { useEffect, useState } from 'react'

type Meter = { label: string; used: number; limit: number; unit: string; note: string }
type Live = { plan: string; asOf: string; meters: Meter[] } | { error: string }
type Build = { month: string; buildMinutes: number; runs: number; assetFiles: number; workerKiB: number; builtAt: string; commit: string }

const SERIF = { fontFamily: 'var(--font-display), Georgia, serif' } as const
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function Bar({ m }: { m: Meter }) {
  const left = Math.max(0, m.limit - m.used)
  const pct = m.limit > 0 ? Math.min(100, (left / m.limit) * 100) : 0
  const low = pct < 20
  return (
    <div className="border-b border-[var(--paper-rule)] px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-[var(--paper-text)]" style={SERIF}>{m.label}</span>
        <span className="text-[11px] tabular-nums text-[var(--paper-muted)]" style={MONO}>{Math.round(pct)}% left</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--paper-quiet)] ring-1 ring-inset ring-[var(--paper-rule-soft)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: low ? '#dc2626' : 'var(--paper-text)' }} />
      </div>
      <p className="m-0 mt-2 text-[12px] tabular-nums text-[var(--paper-muted)]">
        {fmt(left)} of {fmt(m.limit)} {m.unit} left · {fmt(m.used)} used
      </p>
      {m.note && <p className="m-0 mt-0.5 text-[11px] text-[var(--paper-faint)]">{m.note}</p>}
    </div>
  )
}

export function CloudflarePanel() {
  const [live, setLive] = useState<Live | null>(null)
  const [build, setBuild] = useState<Build | null | 'missing'>(null)

  useEffect(() => {
    fetch('/api/cloudflare').then((r) => r.json()).then(setLive).catch(() => setLive({ error: "Cloudflare didn't answer." }))
    fetch('/build-usage.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : 'missing')).then(setBuild).catch(() => setBuild('missing'))
  }, [])

  const buildMeters: Meter[] =
    build && build !== 'missing'
      ? [
          { label: 'Build minutes this month', used: build.buildMinutes, limit: 2_000, unit: 'minutes', note: `GitHub Actions, this repo: ${build.runs} runs since ${build.month}. GitHub Free includes 2,000 a month across private repos.` },
          { label: 'Static files in this deploy', used: build.assetFiles, limit: 20_000, unit: 'files', note: 'Per Worker version.' },
          { label: 'Worker size', used: Math.round(build.workerKiB / 1024), limit: 64, unit: 'MiB', note: 'Uncompressed bundle, per Worker.' },
        ]
      : []

  return (
    <div data-sonar-exempt className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-[var(--paper-rule)] px-5 py-3 text-[12px] text-[var(--paper-muted)]">
        {live && 'plan' in live ? `${live.plan} · nsrgpt` : 'Workers Free · nsrgpt'}
      </div>
      <div className="px-5 pb-1 pt-4 text-[10px] uppercase tracking-[0.18em] text-[var(--paper-faint)]" style={MONO}>Account, live</div>
      {!live && <p className="m-0 px-5 py-4 text-[13px] text-[var(--paper-muted)]">Loading…</p>}
      {live && 'error' in live && <p className="m-0 px-5 py-4 text-[13px] text-[var(--paper-muted)]">{live.error}</p>}
      {live && 'meters' in live && live.meters.map((m) => <Bar key={m.label} m={m} />)}

      <div className="px-5 pb-1 pt-5 text-[10px] uppercase tracking-[0.18em] text-[var(--paper-faint)]" style={MONO}>
        This deploy{build && build !== 'missing' ? ` · ${build.commit} · ${new Date(build.builtAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
      </div>
      {build === null && <p className="m-0 px-5 py-4 text-[13px] text-[var(--paper-muted)]">Loading…</p>}
      {build === 'missing' && <p className="m-0 px-5 py-4 text-[13px] text-[var(--paper-muted)]">This deploy didn&apos;t record its build numbers.</p>}
      {buildMeters.map((m) => <Bar key={m.label} m={m} />)}
    </div>
  )
}
