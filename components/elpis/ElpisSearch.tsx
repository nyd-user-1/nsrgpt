"use client"
// /elpis/search/{endf|exfor|cinda|resonances|decay|covariances} (briefs 67, 69, 77): JANIS Web's six search forms in their
// shape and order (oecd-nea.org/janisweb/search/*, read 2026-11-10): each group a bold label over its fields, Search and
// Reset beneath, then the results. Brief 77: every form runs JANIS's own search over JANIS's own database index
// (components/elpis/janis-search.ts, Lambda nsr-janis); the columns and rows are JANIS's table export, and a row's first
// cell opens what it plots (an EXFOR subentry's page, a cross section's book page). A URL's query fills the form and
// searches at once: target=B-11 (C-0 natural, Am-242-M isomer), reaction=N,A, quantity=SIG, projectile=N|n, mt=107.
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { RotateCcw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AtomSpinner } from "@/components/AtomSpinner"
import { MenuSelect } from "@/components/viz/MenuSelect"
import { MenuMultiSelect } from "@/components/viz/MenuMultiSelect"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { LINE, LINK, Mark, SEARCHES, TINT } from "@/components/elpis/parts"
import { cn } from "@/lib/utils"
import { symbolOfZ } from "@/lib/janis-tree"
import { FORMS, type Group } from "@/components/elpis/search-forms"
import { janisSearch, plotHref, rowHref, type JanisResult } from "@/components/elpis/janis-search"

const PAGE = 300

const SMALL = "text-xs text-[var(--paper-muted)]"
const HALF_MIN = ["0 milliseconds", "1 minute", "1 hour", "1 day", "10 days", "100 days", "10 years", "1e4 years"]
const HALF_MAX = ["1 minute", "1 hour", "1 day", "10 days", "100 days", "10 years", "1e4 years", "infinity"]
/** JANIS's bases to the API's sublibraries, for a query that names a projectile. */
const SUB_OF: Record<string, string> = { "Radioactive data": "decay", "Incident neutron data": "neutrons", "Incident gamma data": "gammas", "Incident proton data": "protons", "Incident deuteron data": "deuterons", "Incident triton data": "tritons", "Incident He3 data": "helium3s", "Incident alpha data": "alphas" }
const BASE_OF = Object.fromEntries(Object.entries(SUB_OF).map(([k, v]) => [v, k]))
const SUB_OF_PROJ: Record<string, string> = { N: "neutrons", G: "gammas", P: "protons", D: "deuterons", T: "tritons", HE3: "helium3s", A: "alphas", n: "neutrons", g: "gammas", p: "protons", d: "deuterons", t: "tritons", h: "helium3s", a: "alphas" }

type Values = Record<string, string | string[]>

const Labeled = ({ label, off, children, className }: { label: string; off?: boolean; children: React.ReactNode; className?: string }) => (
  <label className={cn("flex min-w-0 flex-col gap-1", SMALL, className)}><span>{label}{off && <Mark kind="missing" />}</span>{children}</label>
)
const Box = (props: React.ComponentProps<typeof Input>) => <Input {...props} className={cn("text-[var(--paper-text)]", props.className)} />
const offOf = (g: Group, sub: string) => Array.isArray(g.off) && g.off.includes(sub)
const str = (v: Values, k: string) => { const x = v[k]; return (Array.isArray(x) ? x[0] : x ?? "").trim() }
const list = (v: Values, k: string) => { const x = v[k]; return Array.isArray(x) ? x : x ? [x] : [] }

/** The form's fields named for the URL's query: target=B-11 fills Z, A and State; reaction=N,A the two reaction fields. */
function initialOf(form: string, sp: URLSearchParams): Values {
  const v: Values = {}
  const t = sp.get("target")
  if (t) {
    const m = /^([A-Za-z]{1,3})-(\d+|nat)(?:-?(m\d?|M\d?))?$/.exec(t.trim())
    const z = m ? Array.from({ length: 119 }, (_, i) => symbolOfZ(i).toLowerCase()).indexOf(m[1].toLowerCase()) : -1
    if (m && z >= 0) {
      v["target.z"] = String(z)
      v["target.a"] = m[2].toLowerCase() === "nat" ? "0" : m[2]
      if (m[3]) v["target.state"] = m[3].toUpperCase().startsWith("M2") ? "N" : "M"
    }
  }
  const reaction = sp.get("reaction"), proj = sp.get("projectile")
  if (form === "exfor") {
    if (reaction) [v["reaction.a"], v["reaction.b"]] = reaction.split(",")
    else if (proj) v["reaction.a"] = proj.toUpperCase() === "H" ? "HE3" : proj.toUpperCase()
    if (sp.get("quantity")) v["quantity.b"] = sp.get("quantity") as string
  }
  if (form === "cinda" && reaction) v["quantity.b"] = reaction
  if ((form === "endf" || form === "covariances") && proj && SUB_OF_PROJ[proj]) v.particle = [BASE_OF[SUB_OF_PROJ[proj]]]
  if (sp.get("mt")) { v.mt = sp.get("mt") as string; if (form === "endf") v.mf = sp.get("mf") ?? "3" }
  return v
}

function Target({ name, init, off }: { name: string; init: Values; off?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:max-w-md">
      <Labeled label="Z" off={off}><Box name={`${name}.z`} defaultValue={str(init, `${name}.z`)} aria-label={`${name} Z`} inputMode="numeric" disabled={off} /></Labeled>
      <Labeled label="A" off={off}><Box name={`${name}.a`} defaultValue={str(init, `${name}.a`)} aria-label={`${name} A`} inputMode="numeric" disabled={off} /></Labeled>
      <Labeled label="State" off={off}><Box name={`${name}.state`} defaultValue={str(init, `${name}.state`)} aria-label={`${name} State`} disabled={off} /></Labeled>
    </div>
  )
}

function RangeField({ name, unit }: { name: string; unit: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-[var(--paper-text)]">
      <label className="flex flex-wrap items-center gap-2">
        <input type="radio" name={`${name}.mode`} value="range" defaultChecked className="accent-[var(--paper-strong)]" />
        <Box name={`${name}.min`} aria-label="min" placeholder="min" className="h-9 w-32" /> <span className={SMALL}>to</span> <Box name={`${name}.max`} aria-label="max" placeholder="max" className="h-9 w-32" />
        <span className={SMALL}>{unit}</span>
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <input type="radio" name={`${name}.mode`} value="value" className="accent-[var(--paper-strong)]" />
        <Box name={`${name}.value`} aria-label="value" placeholder="value" className="h-9 w-32" /> <span className={SMALL}>±</span> <Box name={`${name}.delta`} aria-label="delta" placeholder="delta" className="h-9 w-32" />
        <span className={SMALL}>{unit}</span>
      </label>
    </div>
  )
}

/** One choice, the house MenuSelect (no browser dropdowns, Brendan's rule), its value in a hidden input for the form. */
function OneOf({ name, label, options, initial }: { name: string; label: string; options: { value: string; label: string }[]; initial: string }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <input type="hidden" name={name} value={v} />
      <MenuSelect label={label} value={v} onChange={setV} options={options} className="h-10 w-full text-sm" />
    </>
  )
}
/** Several choices, MenuMultiSelect, each in a hidden input of the field's name. */
function SomeOf({ name, label, options, initial }: { name: string; label: string; options: { value: string; label: string }[]; initial: string[] }) {
  const [v, setV] = useState<string[]>(initial)
  return <MenuMultiSelect name={name} label={label} value={v} onChange={setV} options={options} placeholder="Any" className="h-10 w-full text-sm" />
}
const markText = (o: { label: string; mark: string }) => `${o.label}${o.mark === "missing" ? "  ❌" : o.mark === "ours" ? "  ✅" : ""}`

function Field({ g, init }: { g: Group; init: Values }) {
  const k = g.key
  switch (g.kind) {
    case "select": {
      const chosen = list(init, k)
      const opts = g.options.map((o) => ({ value: o.label, label: markText(o) }))
      return (
        <div className="sm:max-w-md">
          {g.multiple
            ? <SomeOf name={k} label={g.label} options={opts} initial={chosen} />
            : <OneOf name={k} label={g.label} options={opts} initial={chosen[0] ?? g.options[0]?.label ?? ""} />}
        </div>
      )
    }
    case "radio":
      return (
        <div className="flex gap-5 text-sm text-[var(--paper-text)]">
          {g.options.map((o, i) => (
            <label key={o.label} className="inline-flex items-center gap-2">
              <input type="radio" name={k} value={o.label} defaultChecked={i === 1} className="accent-[var(--paper-strong)]" />
              {o.label}<Mark kind={o.mark} />
            </label>
          ))}
        </div>
      )
    case "target":
      return <Target name={k} init={init} />
    case "target2":
      return <Target name={k} init={init} />
    case "mt2":
      return <Box name={k} defaultValue={str(init, k)} aria-label="Reaction #2 MT" placeholder="MT" className="sm:max-w-md" />
    case "text":
      return <Box name={k} defaultValue={str(init, k)} aria-label={g.label} placeholder={g.placeholder} disabled={g.off === true} className="sm:max-w-md" />
    case "pair":
      return (
        <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <Labeled label={g.a} off={offOf(g, g.a)}><Box name={`${k}.a`} defaultValue={str(init, `${k}.a`)} aria-label={g.a} disabled={offOf(g, g.a)} /></Labeled>
          <Labeled label={g.b} off={offOf(g, g.b)}><Box name={`${k}.b`} defaultValue={str(init, `${k}.b`)} aria-label={g.b} disabled={offOf(g, g.b)} /></Labeled>
        </div>
      )
    case "energy":
      return <RangeField name={k} unit="eV" />
    case "intensity":
      return <RangeField name={k} unit="%" />
    case "halflife":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="w-40"><OneOf name={`${k}.from`} label="Half-life from" options={HALF_MIN.map((h) => ({ value: h, label: h }))} initial={HALF_MIN[0]} /></div>
          <span className={SMALL}>to</span>
          <div className="w-40"><OneOf name={`${k}.to`} label="Half-life to" options={HALF_MAX.map((h) => ({ value: h, label: h }))} initial="infinity" /></div>
        </div>
      )
    case "subentry":
      return (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Labeled label="Accession #"><Box name={`${k}.acc`} aria-label="Accession number" className="font-mono" /></Labeled>
          <Labeled label="Subaccession #"><Box name={`${k}.sub`} aria-label="Subaccession number" className="font-mono" /></Labeled>
        </div>
      )
    case "author":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Box name={`${k}.name`} aria-label="Author" className="sm:max-w-md" />
          <label className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]"><input type="checkbox" name={`${k}.first`} value="1" className="accent-[var(--paper-strong)]" />1st author</label>
        </div>
      )
    case "reference":
      return (
        <div className="grid gap-3 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
          <Labeled label="Type"><Box name={`${k}.type`} aria-label="Reference type" placeholder="J, R, C, T, B, P" className="font-mono" /></Labeled>
          <label className="inline-flex items-end gap-2 pb-2 text-sm text-[var(--paper-text)]"><input type="checkbox" name={`${k}.main`} value="1" className="accent-[var(--paper-strong)]" />Main ref.</label>
          <Labeled label="Code"><Box name={`${k}.code`} aria-label="Reference code" className="font-mono" /></Labeled>
          <Labeled label="From year"><Box name={`${k}.from`} aria-label="From year" inputMode="numeric" /></Labeled>
          <Labeled label="To year"><Box name={`${k}.to`} aria-label="To year" inputMode="numeric" /></Labeled>
        </div>
      )
    case "institute":
      return (
        <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-3">
          <Labeled label="Area"><Box name={`${k}.area`} aria-label="Area" className="font-mono" /></Labeled>
          <Labeled label="Country"><Box name={`${k}.country`} aria-label="Country" className="font-mono" /></Labeled>
          <Labeled label="Laboratory"><Box name={`${k}.lab`} aria-label="Laboratory" className="font-mono" /></Labeled>
        </div>
      )
    case "points":
      return (
        <div className="flex items-center gap-2">
          <Box name={`${k}.min`} aria-label="Points from" placeholder="min" inputMode="numeric" className="w-32" /> <span className={SMALL}>to</span>
          <Box name={`${k}.max`} aria-label="Points to" placeholder="max" inputMode="numeric" className="w-32" />
        </div>
      )
  }
}

/** The form's values by field name; a multiple select gives every option chosen. */
function valuesOf(form: HTMLFormElement): Values {
  const v: Values = {}
  for (const [k, x] of new FormData(form).entries()) {
    if (typeof x !== "string") continue
    const had = v[k]
    v[k] = had === undefined ? x : Array.isArray(had) ? [...had, x] : [had, x]
  }
  return v
}

export function ElpisSearch({ form }: { form: string }) {
  const f = FORMS[form]
  const sp = useSearchParams()
  const init = useMemo(() => initialOf(form, new URLSearchParams(sp.toString())), [form, sp])
  const [round, setRound] = useState(0) // Reset remounts the fields
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; result?: JanisResult; error?: string; page: number }>({ status: "idle", page: 1 })
  const [shown, setShown] = useState(PAGE)
  const formRef = useRef<HTMLFormElement>(null)
  const ticket = useRef(0)
  const run = async (page = 1) => {
    if (!formRef.current) return
    const n = ++ticket.current
    setState({ status: "loading", page })
    setShown(PAGE)
    try {
      const result = await janisSearch(form, valuesOf(formRef.current))
      if (n === ticket.current) setState({ status: "done", result, page })
    } catch (e) {
      if (n === ticket.current) setState({ status: "error", error: e instanceof Error ? e.message : String(e), page })
    }
  }
  // A query in the URL searches at once.
  useEffect(() => {
    if (Object.keys(init).length) run(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init])
  if (!f) return null
  const r = state.result
  const cols = r?.columns.length ? r.columns : f.columns
  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-3xl tracking-tight text-[var(--paper-text)]" style={SERIF}>{f.title}</h2>
        <span className="flex flex-wrap gap-x-3 text-sm">
          {SEARCHES.filter((s) => s.key !== form).map((s) => <Link key={s.key} href={`/elpis/search/${s.key}`} className={LINK}>{s.name}</Link>)}
        </span>
      </div>
      <form ref={formRef} key={`${round}-${sp.toString()}`} className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); run(1) }}>
        {f.groups.map((g, i) => (
          <div key={`${g.label}-${i}`} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
            <strong className="pt-2 text-sm font-semibold text-[var(--paper-text)]">{g.label}:{g.off === true && <Mark kind="missing" />}</strong>
            <Field g={g} init={init} />
          </div>
        ))}
        <div className="flex gap-2 md:pl-[208px]">
          <Button type="submit" className="h-10 rounded-full px-5"><Search className="size-4" aria-hidden="true" />Search</Button>
          <Button type="button" variant="outline" className="h-10 rounded-full px-5" onClick={() => { setRound((x) => x + 1); setState({ status: "idle", page: 1 }) }}><RotateCcw className="size-4" aria-hidden="true" />Reset</Button>
        </div>
      </form>
      <div className={cn("mt-8 overflow-x-auto rounded-lg border", LINE)}>
        <table className="w-full text-sm text-[var(--paper-text)]">
          <thead>
            <tr className={cn("border-b", LINE, TINT)}>
              {cols.map((c, i) => <th key={`${c}-${i}`} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-[var(--paper-muted)]">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.status === "done" && r && r.rows.slice(0, shown).map((row, k) => {
              const plot = (r.refs[k] ? plotHref(r.refs[k]) : null) ?? rowHref(r.columns, row)
              return (
                <tr key={k} className={cn("border-b last:border-b-0", LINE)}>
                  {row.map((c, i) => <td key={i} className="whitespace-nowrap px-3 py-1.5 align-top">{i === 0 && plot ? <Link href={plot} className={cn(LINK, "font-mono")}>{c}</Link> : c}</td>)}
                </tr>
              )
            })}
            {!(state.status === "done" && r?.rows.length) && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-6 text-center text-sm text-[var(--paper-muted)]">
                  {state.status === "loading" ? <span className="inline-flex justify-center"><AtomSpinner size={40} label="Searching" /></span> : state.status === "error" ? state.error : state.status === "done" ? "No rows match." : "Fill in the form and search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {state.status === "done" && r && r.rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--paper-muted)]">
          <span>{r.total.toLocaleString("en-US")} rows</span>
          {r.rows.length > shown && (
            <Button variant="outline" className="ml-auto h-8 rounded-full px-3" onClick={() => setShown((s) => s + PAGE)}>Show {Math.min(PAGE, r.rows.length - shown)} more</Button>
          )}
        </div>
      )}
    </div>
  )
}
