"use client"

import { useEffect, useState, type ReactNode } from "react"

import type { Block } from "@/lib/lab/blocks"
import { DATA_SOURCES, PROJECTILES, TEMPERATURES, type DataParams, type DataSource } from "@/lib/lab/kinds/data"
import { cn } from "@/lib/utils"
import { MenuSelect } from "@/components/viz/MenuSelect"

// A block's params (brief 52): the same editors on the block (compact) and in the right panel. Numbers take 1e3 or 1000;
// lists take commas. Text fields commit on blur or Enter, so a half-typed number never runs.

export const FIELD = "nodrag h-7 w-full min-w-0 rounded-md border border-[var(--paper-rule)] bg-transparent px-2 text-xs text-[var(--paper-text)] outline-none focus:border-[var(--paper-strong)]"

const toNum = (s: string) => {
  const v = Number(s.trim())
  return s.trim() !== "" && Number.isFinite(v) ? v : undefined
}
const showNum = (v: unknown) => (typeof v === "number" ? (Math.abs(v) >= 1e4 ? v.toExponential().replace("e+", "e") : String(v)) : "")
const showList = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "")
const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2 text-[11px] text-[var(--paper-muted)]">
      <span className="truncate">{label}</span>
      {children}
    </label>
  )
}

/** A text input that commits on blur or Enter. */
function Text({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      className={FIELD}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
    />
  )
}

function Range({ lo, hi, onCommit }: { lo: unknown; hi: unknown; onCommit: (lo?: number, hi?: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Text value={showNum(lo)} placeholder="from" onCommit={(v) => onCommit(toNum(v), typeof hi === "number" ? hi : undefined)} />
      <Text value={showNum(hi)} placeholder="to" onCommit={(v) => onCommit(typeof lo === "number" ? lo : undefined, toNum(v))} />
    </div>
  )
}

function Choice<T extends string>({ value, options, onPick }: { value: T; options: { key: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="nodrag flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onPick(o.key)}
          className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", value === o.key ? "border-[var(--paper-strong)] bg-[var(--paper-quiet)] text-[var(--paper-text)]" : "border-[var(--paper-rule)] text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function BlockParams({ block, onParams, full = false }: { block: Block; onParams: (p: Record<string, unknown>, quiet?: boolean) => void; full?: boolean }) {
  const p = block.params as Record<string, unknown>
  const text = (key: string, label: string, placeholder?: string) => (
    <Row label={label}><Text value={String(p[key] ?? "")} placeholder={placeholder} onCommit={(v) => onParams({ [key]: v.trim() })} /></Row>
  )
  const number = (key: string, label: string) => (
    <Row label={label}><Text value={showNum(p[key])} onCommit={(v) => onParams({ [key]: toNum(v) })} /></Row>
  )
  const list = (key: string, label: string, numeric = false) => (
    <Row label={label}><Text value={showList(p[key])} onCommit={(v) => onParams({ [key]: numeric ? toList(v).map(Number).filter(Number.isFinite) : toList(v) })} /></Row>
  )
  const range = (label = "Energy, eV") => (
    <Row label={label}><Range lo={p.emin} hi={p.emax} onCommit={(emin, emax) => onParams({ emin, emax })} /></Row>
  )
  const highlight = (quiet = false) => {
    const h = (Array.isArray(p.highlight) ? p.highlight : []) as number[]
    return <Row label="Highlight"><Range lo={h[0]} hi={h[1]} onCommit={(a, b) => onParams({ highlight: a !== undefined && b !== undefined ? [a, b] : undefined }, quiet)} /></Row>
  }

  let body: ReactNode = null
  switch (block.kind) {
    case "data": {
      const d = p as DataParams
      body = (
        <>
          <Row label="Source">
            <MenuSelect label="Source" className="nodrag h-7 w-full" value={d.source} onChange={(v) => onParams({ source: v as DataSource })}
              options={DATA_SOURCES.map((s) => ({ value: s.key, label: s.label }))} />
          </Row>
          {d.source === "exfor" && (<>{text("target", "Target", "U-235")}{text("reaction", "Reaction", "N,F")}{text("quantity", "Quantity", "SIG")}{range()}{full && number("limit", "Limit")}</>)}
          {(d.source === "endf" || d.source === "cov") && (
            <>
              {text("name", "Material", "U-235")}
              <Row label="Projectile">
                <MenuSelect label="Projectile" className="nodrag h-7 w-full" value={d.sub ?? "neutrons"} onChange={(v) => onParams({ sub: v === "neutrons" ? undefined : v })}
                  options={PROJECTILES.map((s) => ({ value: s.key, label: s.label }))} />
              </Row>
              {number("mt", "MT")}{list("releases", "Releases")}
              {d.source === "endf" && (
                <Row label="Kelvin">
                  <MenuSelect label="Kelvin" className="nodrag h-7 w-full" value={d.temp ?? 0} onChange={(v) => onParams({ temp: v || undefined })}
                    options={[{ value: 0, label: "0 K, MF3" }, ...TEMPERATURES.map((t) => ({ value: t, label: `${t} K, POINT (B-VIII.1, B-VIII.0)` }))]} />
                </Row>
              )}
              {range()}
            </>
          )}
          {d.source === "nuclide" && text("name", "Nuclide", "137Cs")}
          {d.source === "view" && text("id", "Saved id")}
        </>
      )
      break
    }
    case "process":
      body = (<>{text("name", "Material", "U-235")}{number("mt", "MT")}{list("releases", "Releases")}{list("temperatures", "Kelvin", true)}{range()}</>)
      break
    case "compare":
      body = (<>{number("binsPerDecade", "Bins/dec")}{range()}{highlight()}</>)
      break
    case "plot":
      body = (
        <>
          <Row label="View"><Choice value={String(p.mode ?? "both")} options={[{ key: "sigma", label: "σ" }, { key: "ratio", label: "Ratio" }, { key: "both", label: "Both" }]} onPick={(mode) => onParams({ mode }, true)} /></Row>
          {highlight(true)}
        </>
      )
      break
    case "prompt":
      body = (
        <textarea
          className={cn(FIELD, "nowheel h-auto resize-none py-1.5 leading-relaxed", full ? "min-h-40" : "min-h-16")}
          rows={full ? 8 : 3}
          defaultValue={String(p.prompt ?? "")}
          key={String(p.prompt ?? "")}
          placeholder="Ask about the inputs…"
          onBlur={(e) => e.target.value !== p.prompt && onParams({ prompt: e.target.value })}
        />
      )
      break
  }
  return <div className="flex flex-col gap-1.5">{body}</div>
}
