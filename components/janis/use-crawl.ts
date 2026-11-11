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

export function useCrawl(): CrawlNode | null {
  const [tree, setTree] = useState<CrawlNode | null>(null)
  useEffect(() => {
    let live = true
    fetchCrawl().then((t) => { if (live) setTree(t) })
    return () => { live = false }
  }, [])
  return tree
}
