"use client"
// /elpis/browse (briefs 67, 77): JANIS Web's "Browse database". Brief 77: the tree is JANIS's own, listed by JANIS's code
// over JANIS's database index (the H2 bases JANIS's importer built from janis/data's packages; Lambda nsr-janis,
// GET /janis/list?refs=…, `janis -list`). Levels as JANIS Web shows them: base (datatype), library, data type, element,
// isotope, then the isotope's rows (datablocks); JANIS Web groups a data type's materials by element, so this does too.
// The heading, the breadcrumb bar in the quiet tint, then a bordered list of rows about 49 px tall, each a link one level
// down. A cross-section row of a book projectile opens the book page when JANIS's book has it, else the dataset page.
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { HOVER, LINE, LINK, TINT } from "@/components/elpis/parts"
import { AtomSpinner } from "@/components/AtomSpinner"
import { API_BASE, apiUrl } from "@/lib/api-url"
import { bookNuclide } from "@/components/elpis/use-janis-page"
import { nameOfZ, symbolOfZ } from "@/lib/janis-tree"
import { cn } from "@/lib/utils"

type Kid = { code: string; label: string; short?: string }
type TreeNode = { label: string; children?: Record<string, TreeNode>; materials?: [string, string][] }
const lists = new Map<string, Promise<Kid[] | null>>()
const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s)
/** JANIS's tree down to the materials, listed once by JANIS (scripts/janis/engine/java/TreeExport.java): its full
 *  listings of these levels outrun the API gateway. */
let treeLoad: Promise<Record<string, TreeNode> | null> | null = null
const tree = () => (treeLoad ??= fetch(`${API_BASE}/lake/janis/engine/tree.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
function list(refs: string[]): Promise<Kid[] | null> {
  const key = refs.map(quote).join(" ")
  if (!lists.has(key)) {
    lists.set(key, refs.length <= 3
      ? tree().then((t) => {
        if (!t) return null
        let node: { children?: Record<string, TreeNode>; materials?: [string, string][] } = { children: t }
        for (const r of refs) { node = node.children?.[r] ?? {}; }
        if (node.materials) return node.materials.map(([code, label]) => ({ code, label }))
        return node.children ? Object.entries(node.children).map(([code, n]) => ({ code, label: n.label })) : null
      })
      : fetch(apiUrl(`/janis/list?refs=${encodeURIComponent(key)}`)).then((r) => (r.ok ? r.json() : null)).then((j) => j?.children ?? null).catch(() => null))
  }
  return lists.get(key)!
}
/** The element of a JANIS material code: "Fe56" -> "Fe", "Am242m" -> "Am", "n" -> "n". */
const elementOf = (code: string) => code.match(/^[A-Za-z]+?(?=\d|$)/)?.[0] ?? code
const BOOK_OF: Record<string, string> = { N: "n", G: "g", P: "p", D: "d", T: "t", HE3: "h", A: "a" }
const Z_OF: Record<string, number> = Object.fromEntries(Array.from({ length: 119 }, (_, z) => [symbolOfZ(z), z]))

export function ElpisBrowse({ path }: { path: string[] }) {
  // JANIS's levels: [datatype, dataset, category, element (JANIS Web's grouping), material, datablock]
  const [dt, ds, cat, el, mat] = path
  const refs = useMemo(() => (path.length <= 3 ? path : path.length === 4 ? path.slice(0, 3) : [dt, ds, cat, mat]), [path, dt, ds, cat, mat])
  const [kids, setKids] = useState<Kid[] | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setKids(undefined)
    list(refs).then((k) => { if (live) setKids(k) })
    return () => { live = false }
  }, [refs])

  const href = (segs: string[]) => `/elpis/browse/${segs.map(encodeURIComponent).join("/")}`
  const rows: { name: string; href?: string; open?: string }[] = useMemo(() => {
    if (!kids) return []
    if (path.length === 3) {
      // a data type's materials, grouped by element as JANIS Web lists them
      const els = [...new Set(kids.map((k) => elementOf(k.code)))]
      return els.map((e) => ({ name: elementLabel(e), href: href([dt, ds, cat, e]) }))
    }
    if (path.length === 4) return kids.filter((k) => elementOf(k.code) === el).map((k) => ({ name: k.label, href: href([dt, ds, cat, el, k.code]) }))
    if (path.length === 5) {
      return kids.map((k) => {
        const book = BOOK_OF[dt]
        const mt = /^MT(\d+)$/.exec(k.code)?.[1]
        const open = cat === "SIG" && book && mt ? `/elpis/book/${book}/${bookNuclide(mat)}/${mt}` : undefined
        return { name: k.label, open }
      })
    }
    return kids.map((k) => ({ name: k.label, href: href([...path, k.code]) }))
  }, [kids, path, dt, ds, cat, el, mat])

  // JANIS Web's breadcrumb: each level by its label ("Incident neutron data", "Cross sections"), the element by its symbol
  const [labels, setLabels] = useState<string[]>([])
  useEffect(() => {
    let live = true
    tree().then((t) => {
      if (!live || !t) return
      const a = t[dt], b = a?.children?.[ds], c = b?.children?.[cat]
      setLabels([a?.label, b?.label, c?.label].filter(Boolean) as string[])
    })
    return () => { live = false }
  }, [dt, ds, cat])
  const names = ["Base", dt && (labels[0] ?? dt), ds && (labels[1] ?? ds), cat && (labels[2] ?? cat), el, mat].filter(Boolean) as string[]
  const trail = names.map((name, i) => ({ name, href: i === 0 ? "/elpis/browse" : href(path.slice(0, i)) }))
  const last = trail[trail.length - 1]
  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-6">
      <h2 className="mb-4 text-3xl tracking-tight text-[var(--paper-text)]" style={SERIF}>Browse database</h2>
      <nav aria-label="Breadcrumb" className={cn("mb-4 rounded-lg px-4 py-3 text-sm", TINT)}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {trail.map((t, i) => (
            <li key={t.href + i} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-[var(--paper-faint)]" aria-hidden="true">/</span>}
              {i === trail.length - 1 ? <span className="text-[var(--paper-muted)]" aria-current="page">{t.name}</span> : <Link href={t.href} className={LINK}>{t.name}</Link>}
            </li>
          ))}
        </ol>
      </nav>
      {kids === undefined && <div className="flex justify-center py-8 text-[var(--paper-muted)]"><AtomSpinner size={40} label={`Loading ${last.name}`} /></div>}
      {kids === null && <p className="text-sm text-[var(--paper-muted)]">JANIS lists nothing under {last.name}.</p>}
      {rows.length > 0 && (
        <ul className={cn("overflow-hidden rounded-lg border", LINE)}>
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className={cn("flex min-h-[49px] items-center gap-3 border-b px-4 text-[15px] last:border-b-0", LINE, HOVER)}>
              {path.length === 5 ? (
                <>
                  {r.open ? <Button asChild variant="outline" className="h-8 rounded-full px-4 text-xs"><Link href={r.open}>Open</Link></Button>
                    : <Button variant="outline" disabled className="h-8 rounded-full px-4 text-xs">Open</Button>}
                  <span className="font-mono text-sm text-[var(--paper-text)]">{r.name}</span>
                </>
              ) : (
                <Link href={r.href!} className={cn(LINK, "flex min-h-[49px] flex-1 items-center")}>{r.name}</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** JANIS Web's element row: "26 - Fe - Iron". */
function elementLabel(sym: string): string {
  const z = Z_OF[sym]
  return z === undefined ? sym : `${z} - ${sym} - ${nameOfZ(z)}`
}
