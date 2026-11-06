'use client'

// The particle view (/viz/particles, Brendan, 2026-11-06): one gram of a nuclide heats a column of air, and its decay
// chain's hottest members each vent their own smoke. The physics is threejs-particle-fluids' (plume.ts, world.ts):
// position-based fluid air, Boussinesq buoyancy, vorticity confinement, XSPH viscosity, tracers carried by the air.
// The heat is the sample's own, from the exact Bateman solution and AME2020 Q-values (lib/viz-decay-heat.ts), so the
// plume grows as daughters grow in and dies as the chain runs down to stable. The look is the Spline particle nebula
// Brendan gave as the reference (its colour pairs are the Nebula theme); Decay modes paints each vent in the site's
// decay-mode colours instead. WebGPU only: the library has no WebGL path.

import * as React from 'react'
import Link from 'next/link'
import { Color, SRGBColorSpace, type Vector3 } from 'three'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { FAMILY, familyOf, formatSeconds, halfLifeText, keyOf, loadMassesAndDecay, nucName, type Decay, type Mass } from '@/lib/viz-physics'
import { heatModel, loadMeasured, memberHeat, photonPower, totalHeat, wattsText, type HeatModel, type Measured } from '@/lib/viz-decay-heat'
import { setCamera } from '@/lib/viz-engage'
import { usePaperTheme } from '@/lib/use-paper-theme'
import { buildPlume, VENTS, type Plume, type PlumeValues } from './plume'
import { World, hasWebGPU } from './world'

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const YEAR = 3.15576e7
const KEYS = '← → orbit · ↑ ↓ tilt · Cmd + ↑ ↓ or + − zoom · Shift + arrows pan · Space pause · 0 reset · Click releases smoke · Esc leave'

/** Samples with a story in their heat, and a time scale that shows it in about half a minute. */
const PRESETS: { label: string; z: number; n: number; rate: number }[] = [
  { label: '²²²Rn', z: 86, n: 136, rate: 300 },
  { label: '²²⁶Ra', z: 88, n: 138, rate: 86400 },
  { label: '²¹⁰Po', z: 84, n: 126, rate: 5 * 86400 },
  { label: '⁹⁰Sr', z: 38, n: 52, rate: 43200 },
  { label: '²³⁸Pu', z: 94, n: 144, rate: 3 * YEAR },
  { label: '²⁴¹Pu', z: 94, n: 147, rate: 2 * YEAR },
  { label: '²³²Th', z: 90, n: 142, rate: YEAR },
  { label: '²³⁸U', z: 92, n: 146, rate: 2e4 * YEAR },
]
const RATE_MIN = -6
const RATE_MAX = 18
const toLog = (rate: number) => Math.round(Math.log10(rate) * 4) / 4

/** The Spline nebula's emitter colour pairs (sRGB), one per vent. */
const NEBULA: [number[], number[]][] = [
  [[0.02, 0, 1], [0.79, 0.79, 1]],
  [[0, 0.07, 1], [0.92, 0.21, 0.77]],
  [[0.99, 0.27, 1], [0.24, 0, 1]],
  [[1, 0.49, 0.7], [1, 0, 0.64]],
  [[0.42, 0.54, 1], [0.15, 0.17, 0.59]],
]
const srgb = (c: number[]) => new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace)
const BLACK = new Color(0x000000)

type Mode = 'nebula' | 'modes'

const DEFAULTS: PlumeValues = { heat: 6, cooling: 0.6, vorticity: 0.06, viscosity: 0.02, swirl: 0.35, gravity: 1, emission: 4000, lifetime: 6 }
const BUDGETS = [5000, 10000, 15000, 25000]

type SliderKey = Exclude<keyof PlumeValues, 'lifetime'>
const SLIDERS: { key: SliderKey; label: string; min: number; max: number; step: number; unit: string; digits: number }[] = [
  { key: 'heat', label: 'Buoyancy at peak heat', min: 0, max: 12, step: 0.1, unit: 'm/s²', digits: 1 },
  { key: 'cooling', label: 'Cooling', min: 0, max: 2, step: 0.05, unit: '/s', digits: 2 },
  { key: 'vorticity', label: 'Vorticity', min: 0, max: 0.3, step: 0.01, unit: '', digits: 2 },
  { key: 'viscosity', label: 'Viscosity', min: 0, max: 0.2, step: 0.005, unit: '', digits: 3 },
  { key: 'swirl', label: 'Swirl', min: 0, max: 0.8, step: 0.05, unit: 'm/s', digits: 2 },
  { key: 'gravity', label: 'Gravity', min: 0, max: 5, step: 0.1, unit: 'm/s²', digits: 1 },
  { key: 'emission', label: 'Emission at peak heat', min: 500, max: 8000, step: 250, unit: '/s', digits: 0 },
]

type Data = { decay: Decay; masses: Map<number, Mass>; index: Map<number, number>; measured: Measured | null }
type Readout = { fps: number; t: number; total: number; photons: number; vents: number[] }

/** Each vent's heat and the total at time t, as shares of the sample's peak. */
function shares(m: HeatModel | null, t: number): { vents: number[]; total: number } {
  if (!m || !(m.peak > 0)) return { vents: [], total: 0 }
  return { vents: m.hottest.map((k) => memberHeat(m, k, t) / m.peak), total: totalHeat(m, t) / m.peak }
}

/** Each vent's two colours: the nebula's pair, or its member's decay-mode colour and a lighter (darker) step of it. */
function ventColors(mode: Mode, dark: boolean, model: HeatModel | null, decay: Decay | null): [Color, Color][] {
  return Array.from({ length: VENTS }, (_, j): [Color, Color] => {
    // On light paper the nebula's pale pairs step 30% toward black, so the smoke reads.
    if (mode === 'nebula') return dark ? [srgb(NEBULA[j][0]), srgb(NEBULA[j][1])] : [srgb(NEBULA[j][0]).lerp(BLACK, 0.3), srgb(NEBULA[j][1]).lerp(BLACK, 0.3)]
    const k = model?.hottest[j]
    const f = k === undefined || !decay ? 'unknown' : familyOf(decay.nuclides[model!.chain.members[k]])
    const c = new Color(dark ? FAMILY[f].dark : FAMILY[f].light)
    return [c, c.clone().lerp(new Color(dark ? 0xffffff : 0x000000), dark ? 0.35 : 0.2)]
  })
}

export default function ParticleScene() {
  const box = React.useRef<HTMLDivElement>(null)
  const host = React.useRef<HTMLDivElement>(null)
  const theme = usePaperTheme(box)
  const world = React.useRef<World | null>(null)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'unsupported' | 'failed'>('loading')
  const [error, setError] = React.useState('')
  const [data, setData] = React.useState<Data | null>(null)
  const [start, setStart] = React.useState(keyOf(88, 138))
  const [logRate, setLogRate] = React.useState(toLog(86400))
  const [values, setValues] = React.useState<PlumeValues>(DEFAULTS)
  const [budget, setBudget] = React.useState(BUDGETS[0])
  const [mode, setMode] = React.useState<Mode>('nebula')
  const [air, setAir] = React.useState(false)
  const [playing, setPlaying] = React.useState(true)
  const [resets, setResets] = React.useState(0)
  const [readout, setReadout] = React.useState<Readout>({ fps: 0, t: 0, total: 0, photons: 0, vents: [] })
  // Bumped when a new plume is ready, so its colours are set.
  const [recolor, setRecolor] = React.useState(0)
  // The tracer lifetime rebuilds the scene, so it applies once the slider rests.
  const [lifetime, setLifetime] = React.useState(DEFAULTS.lifetime)
  React.useEffect(() => {
    const id = window.setTimeout(() => setLifetime(values.lifetime), 400)
    return () => window.clearTimeout(id)
  }, [values.lifetime])

  React.useEffect(() => {
    // The measured decay energies are optional: without them, the Q-value estimate stands in.
    Promise.all([loadMassesAndDecay(), loadMeasured().catch(() => null)]).then(
      ([[masses, decay], measured]) =>
        setData({ decay, masses: new Map(masses.map((m) => [keyOf(m.z, m.n), m])), index: new Map(decay.nuclides.map((x, i) => [keyOf(x.z, x.n), i])), measured }),
      () => {
        setStatus('failed')
        setError('The decay data didn’t load.')
      },
    )
  }, [])

  const model = React.useMemo(() => {
    const i = data?.index.get(start)
    return data && i !== undefined ? heatModel(data.decay, data.masses, i, VENTS, data.measured) : null
  }, [data, start])

  // What the frame loop reads between renders.
  const live = React.useRef({ model, rate: 10 ** logRate, t: 0, plume: null as Plume | null })
  live.current.model = model
  live.current.rate = 10 ** logRate

  // The scene: WebGPU, the frame loop, the camera. Once per mount.
  React.useEffect(() => {
    if (!hasWebGPU()) {
      setStatus('unsupported')
      return
    }
    const el = host.current
    if (!el) return
    let alive = true
    const w = new World(
      (s) => {
        const m = live.current.model
        const t = live.current.t
        setReadout({ fps: s.fps, t, total: m ? totalHeat(m, t) : 0, photons: m ? photonPower(m, t) : 0, vents: m ? m.hottest.map((k) => memberHeat(m, k, t)) : [] })
      },
      (e) => {
        if (!alive) return
        setStatus('failed')
        setError(e instanceof Error ? e.message : String(e))
      },
      (at: Vector3) => {
        const s = shares(live.current.model, live.current.t)
        const hottest = s.vents.reduce((best, h, j) => (h > (s.vents[best] ?? -1) ? j : best), 0)
        live.current.plume?.puff(at, hottest)
      },
      () => {
        w.playing = !w.playing
        setPlaying(w.playing)
      },
    )
    w.onStep = (dt) => {
      const l = live.current
      l.t += dt * l.rate
      const s = shares(l.model, l.t)
      w.plume?.update(dt, s.vents, s.total)
    }
    w.init(el).then(
      () => {
        if (!alive) return
        world.current = w
        w.start()
        setStatus('ready')
      },
      (e) => {
        if (!alive) return
        setStatus('failed')
        setError(e instanceof Error ? e.message : String(e))
      },
    )
    setCamera(true, KEYS)
    return () => {
      alive = false
      world.current = null
      live.current.plume = null
      setCamera(false)
      void w.dispose()
    }
  }, [])

  // A fresh column of air: on open, on reset, and when the particle count or tracer lifetime changes.
  const valuesRef = React.useRef(values)
  valuesRef.current = values
  const airRef = React.useRef(air)
  airRef.current = air
  React.useEffect(() => {
    const w = world.current
    if (status !== 'ready' || !w || !data) return
    w.queuePlume(
      (renderer) => buildPlume(renderer, budget, { ...valuesRef.current }),
      (plume) => {
        live.current.plume = plume
        live.current.t = 0
        plume.setVents(live.current.model?.hottest.length ?? 0)
        plume.setAirVisible(airRef.current)
        setRecolor((n) => n + 1)
      },
    )
  }, [status, data, budget, lifetime, resets])

  // A new sample starts its clock at zero, on its own vents.
  React.useEffect(() => {
    live.current.t = 0
    live.current.plume?.setVents(model?.hottest.length ?? 0)
  }, [model])

  // Colours: the theme, the sample's members, the paper.
  React.useEffect(() => {
    live.current.plume?.setColors(ventColors(mode, theme.dark, model, data?.decay ?? null))
  }, [mode, theme.dark, model, data, recolor])
  React.useEffect(() => {
    if (status === 'ready') world.current?.setPaper(theme.paper, theme.dark)
  }, [status, theme])

  const setValue = (key: SliderKey, v: number) => {
    setValues((cur) => ({ ...cur, [key]: v }))
    live.current.plume?.setParameter(key, v)
  }
  const pickStart = (key: number) => {
    setStart(key)
    const p = PRESETS.find((x) => keyOf(x.z, x.n) === key)
    const head = data?.decay.nuclides[data.index.get(key) ?? -1]
    const rate = p?.rate ?? (head?.t ? head.t / 30 : 86400)
    setLogRate(Math.min(RATE_MAX, Math.max(RATE_MIN, toLog(rate))))
  }
  const togglePlay = () => {
    const w = world.current
    if (!w) return
    w.playing = !w.playing
    setPlaying(w.playing)
  }

  const options = React.useMemo<PickerOption[]>(
    () =>
      (data?.decay.nuclides ?? [])
        .filter((x) => x.t !== null && x.t > 0 && x.m.length > 0)
        .sort((a, b) => a.z - b.z || a.n - b.n)
        .map((x) => ({ key: keyOf(x.z, x.n), label: `${x.z + x.n}${x.el}`, alt: `${x.el}${x.z + x.n}` })),
    [data],
  )
  const stepStart = (dir: -1 | 1) => {
    const i = options.findIndex((o) => o.key === start)
    if (i >= 0) pickStart(options[(i + dir + options.length) % options.length].key)
  }

  const colors = ventColors(mode, theme.dark, model, data?.decay ?? null)
  const more = model ? model.chain.members.filter((_, k) => model.perDecay[k] > 0 && model.chain.lambda[k] > 0).length - model.hottest.length : 0
  const notice = status === 'unsupported' || status === 'failed'

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-xl" style={SANS}>
      <div ref={host} className="absolute inset-0" />

      {notice && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-[var(--paper-muted)]">
          <p className="max-w-md">
            {status === 'unsupported' ? 'This chart needs WebGPU: Chrome, Edge or Safari 26.' : `The particle scene stopped: ${error}`}{' '}
            <Link href="/viz/decay" className="text-[var(--paper-text)] underline underline-offset-2">
              The decay simulation runs in any browser.
            </Link>
          </p>
        </div>
      )}
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-[var(--paper-muted)]">Loading…</div>
      )}

      {/* The vents: the sample's hottest members, their heat now. */}
      {model && !notice && (
        <div className="z-10 absolute left-4 top-4 flex w-[240px] flex-col gap-1 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/85 px-3 py-2.5 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
          {model.hottest.map((k, j) => {
            const x = data!.decay.nuclides[model.chain.members[k]]
            const w = readout.vents[j] ?? 0
            const hex = (c: Color) => `#${c.getHexString(SRGBColorSpace)}`
            const swatch = mode === 'nebula' ? `linear-gradient(135deg, ${hex(colors[j][0])}, ${hex(colors[j][1])})` : hex(colors[j][0])
            return (
              <div key={k} className="grid grid-cols-[10px_1fr_auto] items-center gap-x-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch }} />
                <span>
                  {nucName(x)}{' '}
                  <span className="text-[var(--paper-faint)]" style={MONO} title={model.measured[k] ? undefined : 'No measured decay radiation: the Q-value estimate'}>
                    {halfLifeText(x)}
                    {model.measured[k] ? '' : ' · estimated'}
                  </span>
                </span>
                <span className="tabular-nums" style={MONO}>
                  {wattsText(w)}
                </span>
                <span />
                <span className="col-span-2 mb-0.5 h-[3px] rounded-full bg-[var(--paper-rule)]/15">
                  <span className="block h-full rounded-full bg-[var(--paper-text)]/60" style={{ width: `${Math.min(100, (w / (model.peak || 1)) * 100)}%` }} />
                </span>
              </div>
            )
          })}
          {more > 0 && <span className="text-[var(--paper-faint)]">+ {more} more</span>}
          {!model.hottest.length && <span className="text-[var(--paper-muted)]">No decay heat in the data for this nuclide.</span>}
        </div>
      )}

      {/* The physics */}
      {!notice && (
        <div className="z-10 absolute bottom-4 right-4 top-4 flex w-[300px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/90 px-4 py-3 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-[var(--paper-muted)]">Sample, 1 g</span>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => {
                const key = keyOf(p.z, p.n)
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={start === key}
                    onClick={() => pickStart(key)}
                    className={`rounded-full border px-2 py-0.5 transition-colors ${start === key ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
                    style={MONO}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <NuclidePicker value={start} options={options} onPick={(k) => k !== null && pickStart(k)} onStep={stepStart} label="Sample nuclide" />
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--paper-rule)]/10 pt-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--paper-rule)]/25 bg-[var(--paper)] transition-colors hover:bg-[var(--paper-quiet)]"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setResets((n) => n + 1)}
              aria-label="Reset"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--paper-rule)]/25 bg-[var(--paper)] transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <div className="ml-auto grid grid-cols-[auto_auto] gap-x-3 tabular-nums" style={MONO}>
              <span className="text-[var(--paper-muted)]">Elapsed</span>
              <span className="text-right">{readout.t > 0 ? formatSeconds(readout.t) : '0 s'}</span>
              <span className="text-[var(--paper-muted)]">Heat</span>
              <span className="text-right">{wattsText(readout.total)}</span>
              <span className="text-[var(--paper-muted)]" title="γ rays, X-rays and annihilation photons, which leave a small sample">Photons</span>
              <span className="text-right">{wattsText(readout.photons)}</span>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-[var(--paper-muted)]">
              Time scale <span style={MONO}>1 s = {formatSeconds(10 ** logRate)}</span>
            </span>
            <input type="range" min={RATE_MIN} max={RATE_MAX} step={0.25} value={logRate} onChange={(e) => setLogRate(Number(e.target.value))} className="w-full accent-[var(--paper-text)]" />
          </label>

          <div className="flex flex-col gap-2 border-t border-[var(--paper-rule)]/10 pt-3">
            {SLIDERS.map((s) => (
              <label key={s.key} className="flex flex-col gap-1">
                <span className="flex justify-between text-[var(--paper-muted)]">
                  {s.label}
                  <span style={MONO}>
                    {values[s.key].toLocaleString('en', { minimumFractionDigits: s.digits, maximumFractionDigits: s.digits })}
                    {s.unit ? ` ${s.unit}` : ''}
                  </span>
                </span>
                <input type="range" min={s.min} max={s.max} step={s.step} value={values[s.key]} onChange={(e) => setValue(s.key, Number(e.target.value))} className="w-full accent-[var(--paper-text)]" />
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--paper-rule)]/10 pt-3">
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-[var(--paper-muted)]">
                Lifetime <span style={MONO}>{values.lifetime.toFixed(1)} s</span>
              </span>
              <input
                type="range"
                min={2}
                max={10}
                step={0.5}
                value={values.lifetime}
                onChange={(e) => setValues((cur) => ({ ...cur, lifetime: Number(e.target.value) }))}
                className="w-full accent-[var(--paper-text)]"
              />
            </label>
            <Segmented label="Particle count" options={BUDGETS.map((b) => ({ id: b, label: b.toLocaleString('en') }))} value={budget} onChange={setBudget} />
            <Segmented
              label="Colours"
              options={[
                { id: 'nebula' as Mode, label: 'Nebula' },
                { id: 'modes' as Mode, label: 'Decay modes' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <Switch
              label="Air particles"
              on={air}
              onToggle={() => {
                setAir((a) => !a)
                live.current.plume?.setAirVisible(!air)
              }}
            />
            <span className="text-[var(--paper-faint)] tabular-nums" style={MONO}>
              {Math.round(readout.fps)} fps
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[var(--paper-muted)]">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-2 py-0.5 transition-colors ${value === o.id ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            style={MONO}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The knowledge map's switch (app/(site)/viz/knowledge/scene.tsx). */
function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="flex items-center justify-between gap-2 rounded-md border border-[var(--paper-rule)]/25 px-2 py-1 text-left transition-colors hover:bg-[var(--paper-quiet)]"
    >
      <span>{label}</span>
      <span className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? 'bg-[var(--paper-text)]' : 'bg-[var(--paper-rule)]/40'}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--paper)] transition-[left] ${on ? 'left-3' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
