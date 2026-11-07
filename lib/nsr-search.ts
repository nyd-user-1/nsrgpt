import "server-only"

import { AwsClient } from "aws4fetch"

import type { SearchBackend } from "@/lib/search-backends"

// The paper search behind the chat's Sources list and /search (2026-11-07): the NSR-CPT encoder over
// the 277,068 NSR-CPT vectors on a Lambda function URL in the New account (us-east-2), code in
// services/nsr-search/. POST /search {q, k} and GET /health, both checking NSR_SEARCH_KEY.
//
// Env: NSR_SEARCH_LAMBDA_URL, NSR_SEARCH_KEY; the URL is signed (SigV4) with the chat's Athena key
// (NSR_ATHENA_KEY_ID / NSR_ATHENA_SECRET, IAM user nsrgpt-chat-worker).

export type NsrHit = { key_number: string; title: string; year: number | null; doi: string | null; similarity: number }

const URLS: Record<SearchBackend, () => string | undefined> = {
  lambda: () => process.env.NSR_SEARCH_LAMBDA_URL,
}

let signer: AwsClient | null = null
const lambdaSigner = () => {
  const accessKeyId = process.env.NSR_ATHENA_KEY_ID
  const secretAccessKey = process.env.NSR_ATHENA_SECRET
  if (!accessKeyId || !secretAccessKey) return null
  signer ??= new AwsClient({ accessKeyId, secretAccessKey, region: "us-east-2", service: "lambda" })
  return signer
}

async function call(backend: SearchBackend, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const base = URLS[backend]()
  if (!base) throw new Error(`${backend} search is not configured`)
  const url = base.replace(/\/$/, "") + path
  const headers = { "Content-Type": "application/json", "x-api-key": process.env.NSR_SEARCH_KEY ?? "", ...(init.headers as Record<string, string>) }
  const req = { ...init, headers, signal: AbortSignal.timeout(timeoutMs) }
  const s = lambdaSigner()
  if (!s) throw new Error("lambda search has no signing key")
  return s.fetch(url, req)
}

async function searchOn<T = NsrHit>(backend: SearchBackend, q: string, k: number, timeoutMs: number, mode = "semantic"): Promise<T[]> {
  const res = await call(backend, "/search", { method: "POST", body: JSON.stringify({ q, k, mode }) }, timeoutMs)
  if (!res.ok) throw new Error(`${backend} search ${res.status}`)
  const data = (await res.json()) as { results?: T[] }
  return data.results ?? []
}

/** The papers nearest one paper in the NSR-CPT space (its stored vector; no encoder call), for /graph. */
export async function similarPapers(key: string, k: number): Promise<Record<string, unknown>[]> {
  const res = await call("lambda", "/similar", { method: "POST", body: JSON.stringify({ key, k }) }, 70_000)
  if (!res.ok) throw new Error(`lambda similar ${res.status}`)
  return ((await res.json()) as { results?: Record<string, unknown>[] }).results ?? []
}

/** Full record cards for /search: semantic, keyword or hybrid, up to 100. A cold start can take a minute. */
export function searchRecords(q: string, mode: "semantic" | "keyword" | "hybrid", k: number) {
  return searchOn<Record<string, unknown>>("lambda", q, k, 70_000, mode)
}

/** The papers closest to the question. A cold Lambda loads for up to a minute; past 9 s the answer
 *  goes ahead without papers, and the load carries on for the next question. */
export async function searchPapers(q: string, backend: SearchBackend, k = 8): Promise<{ hits: NsrHit[]; backend: SearchBackend } | null> {
  try {
    const hits = await searchOn(backend, q, k, 9000)
    return hits.length ? { hits, backend } : null
  } catch (e) {
    console.info(`nsr search ${backend} failed: ${(e as Error).message}`)
    return null
  }
}

/** Starts the backend loading (a health call), without waiting for it. */
export function wakeSearch(): Promise<unknown> {
  return call("lambda", "/health", { method: "GET" }, 2500).catch(() => null)
}
