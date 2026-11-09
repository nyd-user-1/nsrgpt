import { TableBlock } from "@/components/blocks"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/nova/table"
import { GLOSSARY } from "@/lib/glossary"

// pax2's /glossary (src/app/glossary/page.tsx), ported whole (2026-11-08, brief 32): the one table of every term the app
// shows, in a TableBlock with its search, in the paper palette. The terms are nuclear data's (lib/glossary.ts). A static
// shell: the terms are in the bundle, nothing loads.

export const metadata = { title: "Glossary" }

/** A to Z by the term's full name, letters only: "α (alpha decay)" files under A. */
const SORTED = [...GLOSSARY].sort((a, b) => a.full.replace(/[^\p{L}\p{N} ]/gu, "").localeCompare(b.full.replace(/[^\p{L}\p{N} ]/gu, ""), "en", { sensitivity: "base" }))

export default function GlossaryPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <TableBlock title="Glossary" search="Search terms…" rows={SORTED.map((t) => ({ term: t.full, definition: t.definition, group: t.group }))} name="glossary">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-[var(--paper-quiet)]">
              <TableHead className="w-[26%]">Term</TableHead>
              <TableHead className="w-[60%]">Definition</TableHead>
              <TableHead className="w-[14%]">Group</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SORTED.map((t) => (
              <TableRow key={t.id} id={t.id} className="scroll-mt-24 target:bg-[color-mix(in_oklab,var(--paper-strong)_12%,var(--paper))]">
                <TableCell className="align-top whitespace-normal">
                  <p className="font-semibold text-[var(--paper-text)]">{t.full}</p>
                  {t.short !== t.full && <p className="text-xs text-[var(--paper-faint)]">Shown as “{t.short}”</p>}
                </TableCell>
                <TableCell className="align-top text-sm leading-relaxed whitespace-normal text-[var(--paper-muted)]">{t.definition}</TableCell>
                <TableCell className="align-top text-[var(--paper-text)]">{t.group}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableBlock>
    </div>
  )
}
