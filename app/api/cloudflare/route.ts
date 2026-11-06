import { NextResponse } from "next/server"

// The right panel's Cloudflare view (2026-11-05): this account's Workers usage, read live from the
// Cloudflare API, against the Workers Free plan's limits (developers.cloudflare.com/workers/platform/limits).
// Needs the worker secrets CF_API_TOKEN and CF_ACCOUNT_ID. The per-deploy numbers (build minutes, static
// files, worker size) come from /build-usage.json, written by the deploy workflow.
export const dynamic = "force-dynamic"

const API = "https://api.cloudflare.com/client/v4"

export type Meter = { label: string; used: number; limit: number; unit: string; note: string }

export async function GET() {
  const token = process.env.CF_API_TOKEN
  const account = process.env.CF_ACCOUNT_ID
  if (!token || !account) {
    return NextResponse.json({ error: "Cloudflare usage isn't set up on this deployment." }, { status: 503 })
  }
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const today = new Date().toISOString().slice(0, 10)

  try {
    const [scriptsRes, usageRes] = await Promise.all([
      fetch(`${API}/accounts/${account}/workers/scripts`, { headers }),
      fetch(`${API}/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: `{ viewer { accounts(filter: { accountTag: "${account}" }) { workersInvocationsAdaptive(limit: 1000, filter: { date_geq: "${today}" }) { sum { requests } } } } }`,
        }),
      }),
    ])
    const scripts = ((await scriptsRes.json()) as { result?: { id: string }[] }).result ?? []
    const usage = (await usageRes.json()) as {
      data?: { viewer?: { accounts?: { workersInvocationsAdaptive?: { sum: { requests: number } }[] }[] } }
    }
    const requests = (usage.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? []).reduce((n, r) => n + r.sum.requests, 0)

    const crons = await Promise.all(
      scripts.map(async (s) => {
        const r = await fetch(`${API}/accounts/${account}/workers/scripts/${s.id}/schedules`, { headers })
        const j = (await r.json()) as { result?: { schedules?: unknown[] } }
        return j.result?.schedules?.length ?? 0
      }),
    )

    const meters: Meter[] = [
      { label: "Requests today", used: requests, limit: 100_000, unit: "requests", note: "All Workers on the account. Resets at 00:00 UTC." },
      { label: "Workers", used: scripts.length, limit: 100, unit: "Workers", note: scripts.map((s) => s.id).join(", ") },
      { label: "Cron Triggers", used: crons.reduce((a, b) => a + b, 0), limit: 5, unit: "triggers", note: "Across the account." },
    ]
    return NextResponse.json(
      { plan: "Workers Free", asOf: new Date().toISOString(), meters },
      { headers: { "Cache-Control": "private, max-age=60" } },
    )
  } catch {
    return NextResponse.json({ error: "Cloudflare didn't answer." }, { status: 502 })
  }
}
