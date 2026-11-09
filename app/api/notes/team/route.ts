import { NextResponse } from "next/server"

import { currentUser } from "@/lib/auth"
import { post as postComment } from "@/lib/housekeeping"
import { isTeamPlace, teamText } from "@/lib/note-team"

// A note posted to the team (Brendan, 2026-11-02; pax-trinity's app/api/notes/team, ported 2026-11-09 to NSRgpt's
// wiring; components/notes/note-team.tsx). Signed-in readers; Slack and Discord through env and quiet until set:
//
//   SLACK_BOT_TOKEN          the Slack bot token (chat:write); Slack is off without it
//   NOTES_SLACK_CHANNEL      the Slack channel id the note posts to
//   NOTES_DISCORD_WEBHOOK    the Discord channel's webhook URL; Discord is off without it
//
//   GET   → { comments, slack, discord }: which places can take a post now (nothing is posted to find out)
//   POST  { to: "comments" | "slack" | "discord", text, url, route } → { ok: true, where } or { ok: false, error }
//
// comments: a comment on the page in the Dev Comments stream (lib/housekeeping.ts), anchored to the page

export const dynamic = "force-dynamic"

const MAX = 3500

const wired = () => ({
  comments: true,
  slack: !!(process.env.SLACK_BOT_TOKEN && process.env.NOTES_SLACK_CHANNEL),
  discord: !!process.env.NOTES_DISCORD_WEBHOOK,
})

export async function GET() {
  if (!(await currentUser())) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  return NextResponse.json(wired())
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { to?: unknown; text?: unknown; url?: unknown; route?: unknown } | null
  if (!body || !isTeamPlace(body.to)) return NextResponse.json({ ok: false, error: "to is comments, slack or discord." }, { status: 400 })
  const text = typeof body.text === "string" ? body.text.trim() : ""
  if (!text) return NextResponse.json({ ok: false, error: "The note is empty." }, { status: 400 })
  if (text.length > MAX) return NextResponse.json({ ok: false, error: `A note to the team runs to ${MAX} characters.` }, { status: 400 })
  const url = typeof body.url === "string" && /^https?:\/\//.test(body.url) ? body.url.slice(0, 600) : ""
  if (!url) return NextResponse.json({ ok: false, error: "Which page?" }, { status: 400 })
  const route = typeof body.route === "string" && body.route.startsWith("/") ? body.route.slice(0, 300) : new URL(url).pathname
  const on = wired()
  const writer = user.email
  try {
    if (body.to === "comments") {
      await postComment({ author: user.email, text: teamText("comments", text, url, writer), kind: "comment", page: url, route })
      return NextResponse.json({ ok: true, where: "Dev Comments" })
    }
    if (!on[body.to]) return NextResponse.json({ ok: false, error: `${body.to === "slack" ? "Slack" : "Discord"} isn't connected.` })
    const res =
      body.to === "slack"
        ? await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
            body: JSON.stringify({ channel: process.env.NOTES_SLACK_CHANNEL, text: teamText("slack", text, url, writer) }),
          })
        : await fetch(process.env.NOTES_DISCORD_WEBHOOK!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: teamText("discord", text, url, writer), allowed_mentions: { parse: [] } }),
          })
    if (!res.ok) return NextResponse.json({ ok: false, error: `It answered ${res.status}.` })
    if (body.to === "slack") {
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!j.ok) return NextResponse.json({ ok: false, error: j.error ?? "Slack refused it." })
    }
    return NextResponse.json({ ok: true, where: body.to === "slack" ? "Slack" : "Discord" })
  } catch (e) {
    console.error("notes/team:", body.to, (e as Error).name)
    return NextResponse.json({ ok: false, error: "Not posted." })
  }
}
