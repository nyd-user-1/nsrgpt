"use client"
// /janis (brief 67): brief 68's crawl of JANIS Web's tree, public/janis-tree.json, fetched once a session. Until the
// file is there (or when it fails to load) the pages use the hand list in lib/janis-tree.ts.
import { useEffect, useState } from "react"
import type { CrawlNode } from "@/lib/janis-tree"

let load: Promise<CrawlNode | null> | null = null

function fetchCrawl(): Promise<CrawlNode | null> {
  load ??= fetch("/janis-tree.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: CrawlNode | null) => (j && Array.isArray(j.children) && j.children.length ? j : null))
    .catch(() => null)
  return load
}

/** The crawl's index: undefined while it loads, null when there is none (the hand list answers then). */
export function useCrawl(): CrawlNode | null | undefined {
  const [tree, setTree] = useState<CrawlNode | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    fetchCrawl().then((t) => { if (live) setTree(t) })
    return () => { live = false }
  }, [])
  return tree
}

const files = new Map<string, Promise<CrawlNode | null>>()

/** One library's whole subtree, public/janis-tree/<file>, fetched when a page needs it and kept for the session. */
export function useCrawlFile(file: string | null): CrawlNode | null {
  const [got, setGot] = useState<{ file: string; tree: CrawlNode | null } | null>(null)
  useEffect(() => {
    if (!file) return
    let live = true
    if (!files.has(file)) {
      files.set(file, fetch(`/janis-tree/${encodeURIComponent(file)}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<CrawlNode>) : null))
        .catch(() => null))
    }
    files.get(file)!.then((tree) => { if (live) setGot({ file, tree }) })
    return () => { live = false }
  }, [file])
  return got && got.file === file ? got.tree : null
}
