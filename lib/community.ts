// The store behind /api/community and /api/upload (brief 34): Lambda nsr-api's /community and /files routes, which
// write DynamoDB nsrgpt-views and s3://nsr-lake-613473203863/files/pdfs/workspace/. The app holds no AWS keys: it calls
// the API Gateway origin (CloudFront passes GET and HEAD only, and these answers must not be cached) with the write key,
// NSR_API_WRITE_KEY, set server-side only (the dev box's service from SSM /nsrgpt/devbox/nsr-api-write-key; a Worker
// secret in production). Without the key the routes fall back to the seeds and say saving isn't set up here.

import { currentUser } from "@/lib/auth"

export const API_ORIGIN = process.env.NSR_API_ORIGIN ?? "https://3o2ps7jan4.execute-api.us-east-2.amazonaws.com"
const WRITE_KEY = process.env.NSR_API_WRITE_KEY ?? ""

export const storeConfigured = () => WRITE_KEY !== ""

export type LibFile = { key: string; name: string; size: number; modified: string | null }

/** One call to the store; throws with the store's own error text when it refuses. */
export async function store<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`${API_ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: { "x-nsr-write-key": WRITE_KEY, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw Object.assign(new Error(j.error ?? `store ${r.status}`), { status: r.status })
  return j
}

/** The name a save or an upload is stamped with: the signed-in reader's name, else the part of the email before @. */
export async function signedInName(): Promise<string | null> {
  const user = await currentUser()
  if (!user) return null
  return user.name || user.email.split("@")[0] || null
}
