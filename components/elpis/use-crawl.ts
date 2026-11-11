"use client"
// /elpis (briefs 67, 69): the marked crawl of JANIS Web's tree, fetched once a session from the CDN, where elpis-fill's
// mark.py rewrites it on every run (lake/janis/current/: index.json, and lib-NNN.json per library, the index's `file`
// fields; five minutes' cache; a CloudFront Function sets the CORS header on every response). When the index does not
// load, the pages use the hand list in lib/janis-tree.ts.
import { useEffect, useState } from "react"
import { API_BASE } from "@/lib/api-url"
import type { CrawlNode } from "@/lib/janis-tree"

const CDN = `${API_BASE}/lake/janis/current`
let load: Promise<CrawlNode | null> | null = null

const getTree = (url: string) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: CrawlNode | null) => (j && Array.isArray(j.children) && j.children.length ? j : null))
    .catch(() => null)

function fetchCrawl(): Promise<CrawlNode | null> {
  load ??= getTree(`${CDN}/index.json`)
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

/** One library's whole subtree (the CDN's lib-NNN.json), fetched when a page needs it and kept for the session. */
export function useCrawlFile(file: string | null): CrawlNode | null {
  const [got, setGot] = useState<{ file: string; tree: CrawlNode | null } | null>(null)
  useEffect(() => {
    if (!file) return
    let live = true
    if (!files.has(file)) {
      files.set(file, getTree(`${CDN}/${encodeURIComponent(file)}`))
    }
    files.get(file)!.then((tree) => { if (live) setGot({ file, tree }) })
    return () => { live = false }
  }, [file])
  return got && got.file === file ? got.tree : null
}
