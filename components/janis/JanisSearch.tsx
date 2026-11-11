"use client"
// /janis/search/{endf|exfor|cinda|resonances|decay|covariances} (brief 67): JANIS Web's six search forms in their
// shape and order (oecd-nea.org/janisweb/search/*, read 2026-11-10): each group a bold label over its fields, Search and
// Reset beneath, then an empty results table with JANIS's own column headers. UI only: Search runs nothing. An option
// JANIS has and I do not carries ❌; one I have and JANIS does not, ✅.
import { useState } from "react"
import Link from "next/link"
import { RotateCcw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { LINE, LINK, Mark, SEARCHES, TINT } from "@/components/janis/parts"
import { cn } from "@/lib/utils"
import { FORMS, type Group } from "@/components/janis/search-forms"

const SELECT = "h-10 w-full rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 text-sm text-[var(--paper-text)]"
const SMALL = "text-xs text-[var(--paper-muted)]"
const HALF_MIN = ["0 milliseconds", "1 minute", "1 hour", "1 day", "10 days", "100 days", "10 years", "1e4 years"]
const HALF_MAX = ["1 minute", "1 hour", "1 day", "10 days", "100 days", "10 years", "1e4 years", "infinity"]

const Labeled = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={cn("flex min-w-0 flex-col gap-1", SMALL, className)}>{label}{children}</label>
)
const Box = (props: React.ComponentProps<typeof Input>) => <Input {...props} className={cn("text-[var(--paper-text)]", props.className)} />

function Target({ prefix = "" }: { prefix?: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:max-w-md">
      <Labeled label="Z"><Box aria-label={`${prefix}Z`} inputMode="numeric" /></Labeled>
      <Labeled label="A"><Box aria-label={`${prefix}A`} inputMode="numeric" /></Labeled>
      <Labeled label="State"><Box aria-label={`${prefix}State`} /></Labeled>
    </div>
  )
}

function Range({ name, unit }: { name: string; unit: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-[var(--paper-text)]">
      <label className="flex flex-wrap items-center gap-2">
        <input type="radio" name={name} defaultChecked className="accent-[var(--paper-strong)]" />
        <Box aria-label="min" placeholder="min" className="h-9 w-32" /> <span className={SMALL}>to</span> <Box aria-label="max" placeholder="max" className="h-9 w-32" />
        <span className={SMALL}>{unit}</span>
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <input type="radio" name={name} className="accent-[var(--paper-strong)]" />
        <Box aria-label="value" placeholder="value" className="h-9 w-32" /> <span className={SMALL}>±</span> <Box aria-label="delta" placeholder="delta" className="h-9 w-32" />
        <span className={SMALL}>{unit}</span>
      </label>
    </div>
  )
}

function Field({ g, id }: { g: Group; id: string }) {
  switch (g.kind) {
    case "select":
      return (
        <select multiple={g.multiple} size={g.multiple ? Math.min(6, g.options.length) : undefined} aria-label={g.label} className={cn(SELECT, g.multiple && "h-auto py-1")}>
          {g.options.map((o) => <option key={o.label} value={o.label}>{o.label}{o.mark === "missing" ? "  ❌" : o.mark === "ours" ? "  ✅" : ""}</option>)}
        </select>
      )
    case "radio":
      return (
        <div className="flex gap-5 text-sm text-[var(--paper-text)]">
          {g.options.map((o, i) => (
            <label key={o.label} className="inline-flex items-center gap-2">
              <input type="radio" name={`${id}-fmt`} defaultChecked={i === 1} disabled={!o.held} className="accent-[var(--paper-strong)]" />
              {o.label}<Mark kind={o.mark} />
            </label>
          ))}
        </div>
      )
    case "target":
      return <Target prefix={`${g.label} `} />
    case "target2":
      return (
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]"><input type="checkbox" defaultChecked className="accent-[var(--paper-strong)]" />same as Material #1</label>
          <Target prefix="Material #2 " />
        </div>
      )
    case "mt2":
      return (
        <div className="flex flex-col gap-2 sm:max-w-md">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]"><input type="checkbox" defaultChecked className="accent-[var(--paper-strong)]" />same as Reaction #1</label>
          <Box aria-label="Reaction #2 MT" placeholder="MT" />
        </div>
      )
    case "text":
      return <Box aria-label={g.label} placeholder={g.placeholder} className="sm:max-w-md" />
    case "pair":
      return (
        <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <Labeled label={g.a}><Box aria-label={g.a} /></Labeled>
          <Labeled label={g.b}><Box aria-label={g.b} /></Labeled>
        </div>
      )
    case "energy":
      return <Range name={`${id}-e`} unit="eV" />
    case "intensity":
      return <Range name={`${id}-i`} unit="%" />
    case "halflife":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Half-life from" className={cn(SELECT, "w-40")}>{HALF_MIN.map((h) => <option key={h}>{h}</option>)}</select>
          <span className={SMALL}>to</span>
          <select aria-label="Half-life to" defaultValue="infinity" className={cn(SELECT, "w-40")}>{HALF_MAX.map((h) => <option key={h}>{h}</option>)}</select>
        </div>
      )
    case "subentry":
      return (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Labeled label="Accession #"><Box aria-label="Accession number" className="font-mono" /></Labeled>
          <Labeled label="Subaccession #"><Box aria-label="Subaccession number" className="font-mono" /></Labeled>
        </div>
      )
    case "author":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Box aria-label="Author" className="sm:max-w-md" />
          <label className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]"><input type="checkbox" className="accent-[var(--paper-strong)]" />1st author</label>
        </div>
      )
    case "reference":
      return (
        <div className="grid gap-3 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
          <Labeled label="Type"><select aria-label="Reference type" className={SELECT}>{["Any", "Journal", "Report", "Conference", "Thesis", "Book", "Private communication"].map((t) => <option key={t}>{t}</option>)}</select></Labeled>
          <label className="inline-flex items-end gap-2 pb-2 text-sm text-[var(--paper-text)]"><input type="checkbox" className="accent-[var(--paper-strong)]" />Main ref.</label>
          <Labeled label="Code"><Box aria-label="Reference code" className="font-mono" /></Labeled>
          <Labeled label="From year"><Box aria-label="From year" inputMode="numeric" /></Labeled>
          <Labeled label="To year"><Box aria-label="To year" inputMode="numeric" /></Labeled>
        </div>
      )
    case "institute":
      return (
        <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-3">
          <Labeled label="Area"><Box aria-label="Area" /></Labeled>
          <Labeled label="Country"><Box aria-label="Country" /></Labeled>
          <Labeled label="Laboratory"><Box aria-label="Laboratory" className="font-mono" /></Labeled>
        </div>
      )
    case "points":
      return (
        <div className="flex items-center gap-2">
          <Box aria-label="Points from" placeholder="min" inputMode="numeric" className="w-32" /> <span className={SMALL}>to</span>
          <Box aria-label="Points to" placeholder="max" inputMode="numeric" className="w-32" />
        </div>
      )
  }
}

export function JanisSearch({ form }: { form: string }) {
  const f = FORMS[form]
  const [round, setRound] = useState(0) // Reset remounts the fields
  const [searched, setSearched] = useState(false)
  if (!f) return null
  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-3xl tracking-tight text-[var(--paper-text)]" style={SERIF}>{f.title}</h2>
        <span className="flex flex-wrap gap-x-3 text-sm">
          {SEARCHES.filter((s) => s.key !== form).map((s) => <Link key={s.key} href={`/janis/search/${s.key}`} className={LINK}>{s.name}</Link>)}
        </span>
      </div>
      <form key={round} className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); setSearched(true) }}>
        {f.groups.map((g, i) => (
          <div key={`${g.label}-${i}`} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
            <strong className="pt-2 text-sm font-semibold text-[var(--paper-text)]">{g.label}:</strong>
            <Field g={g} id={`${form}-${i}`} />
          </div>
        ))}
        <div className="flex gap-2 md:pl-[208px]">
          <Button type="submit" className="h-10 rounded-full px-5"><Search className="size-4" aria-hidden="true" />Search</Button>
          <Button type="button" variant="outline" className="h-10 rounded-full px-5" onClick={() => { setRound((r) => r + 1); setSearched(false) }}><RotateCcw className="size-4" aria-hidden="true" />Reset</Button>
        </div>
      </form>
      <div className={cn("mt-8 overflow-x-auto rounded-lg border", LINE)}>
        <table className="w-full text-sm text-[var(--paper-text)]">
          <thead>
            <tr className={cn("border-b", LINE, TINT)}>
              <th className="w-10 px-3 py-2 text-left"><input type="checkbox" aria-label="Select all" disabled className="accent-[var(--paper-strong)]" /></th>
              {f.columns.map((c, i) => <th key={`${c}-${i}`} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-[var(--paper-muted)]">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={f.columns.length + 1} className="px-3 py-6 text-center text-sm text-[var(--paper-muted)]">
                {searched ? "No rows: this page is not wired to data yet." : "Fill in the form and search."}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
