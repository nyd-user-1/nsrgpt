"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { TableBlock } from "@/components/blocks"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/nova/table"
import { DATASETS, DICTIONARY, type Field } from "@/lib/data-dictionary"
import { cn } from "@/lib/utils"

// The Data dictionary's table: the Glossary's TableBlock and columns, grouped by dataset. The search filters the rows in
// state (the block's controlled search), so a group whose rows all miss drops its heading too. A column header sorts
// the rows within each group, ascending, then descending, then back to the order the API returns them in; Source dataset
// sorts the groups themselves.

type Key = "field" | "type" | "dataset" | "table" | "description" | "where"
type Sort = { key: Key; dir: 1 | -1 } | null

const COLUMNS: { key: Key; label: string; width: string }[] = [
  { key: "field", label: "Field", width: "w-[15%]" },
  { key: "type", label: "Type", width: "w-[10%]" },
  { key: "dataset", label: "Source dataset", width: "w-[10%]" },
  { key: "table", label: "Table", width: "w-[15%]" },
  { key: "description", label: "Description", width: "w-[32%]" },
  { key: "where", label: "Where it appears", width: "w-[18%]" },
]

const whereOf = (f: Field) => [...f.pages, `API ${f.route}`].join(" ")
const valueOf = (f: Field, k: Key) => (k === "where" ? whereOf(f) : f[k])
const haystack = (f: Field) => [f.field, f.type, f.dataset, f.table, f.description, whereOf(f)].join(" ").toLowerCase()

export function DictionaryTable() {
  const [q, setQ] = React.useState("")
  const [sort, setSort] = React.useState<Sort>(null)
  const next = (key: Key) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null))
  const groups = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hits = needle ? DICTIONARY.filter((f) => haystack(f).includes(needle)) : DICTIONARY
    const order = sort?.key === "dataset" && sort.dir === -1 ? [...DATASETS].reverse() : DATASETS
    return order
      .map((d) => {
        const rows = hits.filter((f) => f.dataset === d)
        if (sort && sort.key !== "dataset") rows.sort((a, b) => sort.dir * valueOf(a, sort.key).localeCompare(valueOf(b, sort.key), "en", { sensitivity: "base", numeric: true }))
        return { dataset: d, rows }
      })
      .filter((g) => g.rows.length)
  }, [q, sort])
  return (
    <TableBlock title="Data dictionary" search="Search fields…" searchValue={q} onSearch={setQ} rows={DICTIONARY.map((f) => ({ field: f.field, type: f.type, dataset: f.dataset, table: f.table, description: f.description, pages: f.pages.join(" "), route: f.route }))} name="data-dictionary">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--paper-quiet)]">
            {COLUMNS.map((c) => {
              const on = sort?.key === c.key
              const Icon = !on ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
              return (
                <TableHead key={c.key} className={c.width} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => next(c.key)} className={cn("group inline-flex items-center gap-1 hover:text-[var(--paper-text)]", on ? "text-[var(--paper-text)]" : "text-[var(--paper-muted)]")}>
                    {c.label}
                    <Icon className={cn("size-3.5 shrink-0", on ? "text-[var(--paper-strong)]" : "text-[var(--paper-faint)] opacity-0 transition-opacity group-hover:opacity-100")} />
                  </button>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        {groups.map((g) => (
          <TableBody key={g.dataset}>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMNS.length} className="pt-4 text-[13px] font-semibold text-[var(--paper-text)]">
                {g.dataset} <span className="tabular font-normal text-[var(--paper-faint)]">{g.rows.length}</span>
              </TableCell>
            </TableRow>
            {g.rows.map((f) => (
              <TableRow key={f.id} id={f.id} className="scroll-mt-24 target:bg-[color-mix(in_oklab,var(--paper-strong)_12%,var(--paper))]">
                <TableCell className="align-top font-mono text-[13px] font-semibold whitespace-normal break-all text-[var(--paper-text)]">{f.field}</TableCell>
                <TableCell className="align-top font-mono text-xs whitespace-normal break-all text-[var(--paper-muted)]">{f.type}</TableCell>
                <TableCell className="align-top text-[var(--paper-text)]">{f.dataset}</TableCell>
                <TableCell className="align-top font-mono text-xs whitespace-normal break-all text-[var(--paper-muted)]">{f.table}</TableCell>
                <TableCell className="align-top text-sm leading-relaxed whitespace-normal text-[var(--paper-muted)]">{f.description}</TableCell>
                <TableCell className="align-top text-sm whitespace-normal text-[var(--paper-text)]">
                  {f.pages.map((p) => <p key={p}>{p}</p>)}
                  <p className="font-mono text-xs break-all text-[var(--paper-faint)]">API {f.route}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        ))}
        {groups.length === 0 && (
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMNS.length} className="py-6 text-center text-sm text-[var(--paper-muted)]">No field matches “{q.trim()}”.</TableCell>
            </TableRow>
          </TableBody>
        )}
      </Table>
    </TableBlock>
  )
}
