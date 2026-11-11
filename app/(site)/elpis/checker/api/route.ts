import { NextRequest, NextResponse } from "next/server"

// /elpis/checker/api (brief 71): the checker page's file goes through here to nsr-api's /exfor/check
// (services/nsr-api/exfor_check.py). CloudFront passes GET and HEAD only, so this calls the API Gateway origin. Up to
// 5 MB the file rides in the request; above that, nsr-api hands out a presigned PUT to lake/_work/exfor-check/ (the
// write key, NSR_API_WRITE_KEY, server-side only), this server puts the file there, and the check reads it back.
const ORIGIN = process.env.NSR_API_ORIGIN ?? "https://3o2ps7jan4.execute-api.us-east-2.amazonaws.com"
const KEY = process.env.NSR_API_WRITE_KEY ?? ""
const DIRECT = 5_000_000
const MAX = 20_000_000

export const dynamic = "force-dynamic"

const fail = (status: number, error: string) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") || "file").slice(0, 120)
  const body = await req.arrayBuffer()
  if (body.byteLength > MAX) return fail(413, `The file is ${(body.byteLength / 1e6).toFixed(1)} MB; I check files up to 20 MB.`)
  const q = `name=${encodeURIComponent(name)}`
  let r: Response
  try {
    if (body.byteLength <= DIRECT) {
      r = await fetch(`${ORIGIN}/exfor/check?${q}`, {
        method: "POST", body, headers: { "content-type": "application/octet-stream" }, cache: "no-store",
      })
    } else {
      if (!KEY) return fail(503, "Files over 5 MB go through the upload store, which isn't set up on this server.")
      const up = await fetch(`${ORIGIN}/exfor/check/upload`, { method: "POST", headers: { "x-nsr-write-key": KEY }, cache: "no-store" })
      const u = (await up.json().catch(() => ({}))) as { key?: string; url?: string; error?: string }
      if (!up.ok || !u.url || !u.key) return fail(502, u.error ?? "The upload store refused the file.")
      const put = await fetch(u.url, { method: "PUT", body, headers: { "content-type": "application/octet-stream" } })
      if (!put.ok) return fail(502, `The upload store answered ${put.status}.`)
      r = await fetch(`${ORIGIN}/exfor/check?key=${u.key}&${q}`, { cache: "no-store" })
    }
  } catch {
    return fail(502, "I couldn't reach the checker.")
  }
  const j = await r.json().catch(() => ({ error: `The checker answered ${r.status}.` }))
  return NextResponse.json(j, { status: r.ok ? 200 : r.status })
}
