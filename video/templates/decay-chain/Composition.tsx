import * as React from "react"
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"

import { draw, enter, fade } from "../../motion"
import { FONT, LAYOUT, MODE_COLOR, MODE_LABEL, TYPE, palette, sec } from "../../theme"
import { stepSeconds, type DecayChainProps } from "./schema"

// A decay chain, parent to stable end, laid out in rows of five that turn at each end. The parent lands; then for each
// step in order the arrow from the step before draws, labelled with the mode it leaves by, and the daughter springs in
// with its half-life. The stable end is ringed last.

const PER_ROW = 5
const BOX_W = 260
const BOX_H = 150
const GAP_X = 92
const GAP_Y = 96
const TOP = 230

export function DecayChainComposition({ title, steps, source, theme }: DecayChainProps) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const c = palette(theme)
  const head = enter(frame, fps)
  const n = steps.length
  const step = stepSeconds(n)
  const rowW = Math.min(n, PER_ROW) * BOX_W + (Math.min(n, PER_ROW) - 1) * GAP_X
  const left0 = (width - rowW) / 2

  // Snake order: even rows left to right, odd rows right to left.
  const at = (i: number) => {
    const row = Math.floor(i / PER_ROW)
    const col = i % PER_ROW
    const c2 = row % 2 === 0 ? col : PER_ROW - 1 - col
    return { x: left0 + c2 * (BOX_W + GAP_X), y: TOP + row * (BOX_H + GAP_Y), row }
  }
  const start = sec(0.4, fps)
  const arrowAt = (i: number) => start + sec(0.3, fps) + sec((i - 1) * step, fps)
  const boxAt = (i: number) => (i === 0 ? start : arrowAt(i) + sec(0.28, fps))
  const last = n - 1
  const ring = fade(frame, fps, boxAt(last) + sec(0.35, fps))
  const foot = fade(frame, fps, boxAt(last) + sec(0.5, fps))

  return (
    <AbsoluteFill style={{ backgroundColor: c.ground, fontFamily: FONT.family, color: c.ink }}>
      <div style={{ position: "absolute", left: LAYOUT.safe, right: LAYOUT.safe, top: LAYOUT.safe, opacity: head, transform: `translateY(${(1 - head) * 24}px)` }}>
        <div style={{ fontSize: TYPE.heading, fontWeight: 700, letterSpacing: -0.5 }}>{title}</div>
      </div>

      <svg width={width} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker id="dc-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c.muted} />
          </marker>
        </defs>
        {steps.slice(1).map((s, k) => {
          const i = k + 1
          const a = at(i - 1)
          const b = at(i)
          const t = draw(frame, fps, arrowAt(i), Math.min(0.35, step))
          if (t <= 0) return null
          const mode = steps[i - 1].mode
          // Along a row the arrow runs edge to edge; at a turn it drops from the box above.
          const turn = b.row !== a.row
          const x1 = turn ? a.x + BOX_W / 2 : a.x < b.x ? a.x + BOX_W + 10 : a.x - 10
          const y1 = turn ? a.y + BOX_H + 10 : a.y + BOX_H / 2
          const x2 = turn ? b.x + BOX_W / 2 : a.x < b.x ? b.x - 14 : b.x + BOX_W + 14
          const y2 = turn ? b.y - 14 : b.y + BOX_H / 2
          const xm = x1 + (x2 - x1) * t
          const ym = y1 + (y2 - y1) * t
          const color = (mode && MODE_COLOR[mode]) || c.muted
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={xm} y2={ym} stroke={c.muted} strokeWidth={3} markerEnd={t > 0.9 ? "url(#dc-head)" : undefined} />
              {mode && t > 0.5 && (
                <text x={(x1 + x2) / 2 + (turn ? 22 : 0)} y={(y1 + y2) / 2 - (turn ? 0 : 16)} textAnchor={turn ? "start" : "middle"} dominantBaseline={turn ? "middle" : "auto"} fontSize={TYPE.caption} fontWeight={700} fill={color} fontFamily={FONT.family} opacity={Math.min(1, (t - 0.5) * 2)}>
                  {MODE_LABEL[mode] ?? mode}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {steps.map((s, i) => {
        const p = at(i)
        const t = enter(frame, fps, boxAt(i))
        if (t <= 0.001) return null
        const band = s.stable ? c.ink : (s.mode && MODE_COLOR[s.mode]) || c.faint
        return (
          <div
            key={`${s.nuclide}-${i}`}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: BOX_W,
              height: BOX_H,
              borderRadius: 22,
              backgroundColor: c.card,
              border: `2px solid ${s.stable && i === last ? c.ink : c.rule}`,
              boxShadow: s.stable && i === last ? `0 0 0 ${8 * ring}px ${c.accent}33` : "0 6px 18px rgb(15 23 42 / 0.08)",
              overflow: "hidden",
              opacity: Math.min(1, t),
              transform: `scale(${0.7 + 0.3 * Math.min(1, t)})`,
            }}
          >
            <div style={{ height: 10, backgroundColor: band }} />
            <div style={{ padding: "18px 22px 0" }}>
              <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -0.5 }}>{s.nuclide}</div>
              <div style={{ marginTop: 8, fontSize: TYPE.caption, color: c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.stable ? <span style={{ opacity: ring, fontWeight: 700, color: c.ink }}>stable</span> : s.halfLife}
              </div>
            </div>
          </div>
        )
      })}

      <div style={{ position: "absolute", left: LAYOUT.safe, bottom: 40, display: "flex", gap: 28, alignItems: "center", fontSize: TYPE.small, color: c.muted, opacity: foot }}>
        <span>{source}</span>
        {(["A", "B-", "B+", "IT"] as const)
          .filter((m) => steps.some((s) => s.mode === m || (m === "B+" && s.mode === "EC")))
          .map((m) => (
            <span key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: MODE_COLOR[m] }} />
              {MODE_LABEL[m]}
            </span>
          ))}
      </div>
    </AbsoluteFill>
  )
}
