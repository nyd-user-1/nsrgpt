// A note to the team (Brendan, 2026-11-02, the ShiftNote brief; ported from pax-trinity's lib/note-team.ts 2026-11-09):
// the note's text and the page it was written on, posted to any of three places, one, two or all: a Dev Comment on
// the page (the admins' stream, lib/housekeeping.ts), Slack and Discord through the channel and webhook the server
// holds in its environment (app/api/notes/team). Client-safe: the places and the words that go out.

export type TeamPlace = "comments" | "slack" | "discord"

export const TEAM_PLACES: { place: TeamPlace; label: string; mark: string | null }[] = [
  { place: "comments", label: "Dev Comments", mark: null },
  { place: "slack", label: "Slack", mark: "/logos/250px-Slack_icon_2019.svg.png" },
  { place: "discord", label: "Discord", mark: null },
]

export const isTeamPlace = (v: unknown): v is TeamPlace => v === "comments" || v === "slack" || v === "discord"

/** What goes out: the note, then the page's link; Discord's webhook posts under its own name, so the writer signs it. */
export function teamText(place: TeamPlace, note: string, url: string, writer: string): string {
  const body = `${note.trim()}\n\n${url}`
  return place === "discord" ? `${body}\n— ${writer}` : body
}
