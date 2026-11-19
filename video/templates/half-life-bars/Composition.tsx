import * as React from "react"
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"

import { draw, enter, fade, pale } from "../../motion"
import { FONT, LAYOUT, MOTION, TYPE, palette, sec } from "../../theme"
import type { HalfLifeBarsProps } from "./schema"

// Half-lives on a log scale of time. The axis and its time marks (a second, an hour, a year, a billion years) fade in;
// the bars draw from the axis in a stagger, longest first; each half-life fades in at its bar's end as the bar lands.

const TOP = 210
const BOTTOM = 150
const LEFT = 300
const RIGHT = 280

/** Marks a reader knows, in seconds. */
const MARKS: [number, string][] = [
  [1e-6, "1 µs"], [1e-3, "1 ms"], [1, "1 s"], [60, "1 min"], [3600, "1 h"], [86400, "1 d"], [3.15576e7, "1 y"],
  [3.15576e10, "1,000 y"], [3.15576e13, "1 million y"], [3.15576e16, "1 billion y"],
]

export function HalfLifeBarsComposition({ title, rows, source, theme }: HalfLifeBarsProps) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const c = palette(theme)
  const head = enter(frame, fps)
  const axis = fade(frame, fps, sec(0.3, fps))

  const sorted = [...rows].sort((a, b) => b.seconds - a.seconds)
  const lo = Math.floor(Math.log10(Math.min(...rows.map((r) => r.seconds)))) - 1
  const hi = Math.ceil(Math.log10(Math.max(...rows.map((r) => r.seconds))))
  const plotW = width - LEFT - RIGHT
  const plotH = height - TOP - BOTTOM
  const X = (s: number) => LEFT + ((Math.log10(s) - lo) / (hi - lo)) * plotW
  const lane = plotH / sorted.length
  const barH = Math.min(56, lane * 0.62)
  const marks = MARKS.filter(([s]) => Math.log10(s) >= lo && Math.log10(s) <= hi)
  const begin = sec(0.6, fps)
  const stagger = sec(Math.min(MOTION.stagger, 4 / sorted.length), fps)
  const last = begin + stagger * (sorted.length - 1) + sec(MOTION.draw, fps)
  const foot = fade(frame, fps, last)

  return (
    <AbsoluteFill style={{ backgroundColor: c.ground, fontFamily: FONT.family, color: c.ink }}>
      <div style={{ position: "absolute", left: LAYOUT.safe, right: LAYOUT.safe, top: LAYOUT.safe, opacity: head, transform: `translateY(${(1 - head) * 24}px)` }}>
        <div style={{ fontSize: TYPE.heading, fontWeight: 700, letterSpacing: -0.5 }}>{title}</div>
      </div>

      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <g opacity={axis}>
          {marks.map(([s, label]) => (
            <g key={label}>
              <line x1={X(s)} x2={X(s)} y1={TOP - 10} y2={TOP + plotH} stroke={c.rule} strokeWidth={1} />
              <text x={X(s)} y={TOP + plotH + 40} textAnchor="middle" fontSize={TYPE.small} fill={c.faint} fontFamily={FONT.family}>
                {label}
              </text>
            </g>
          ))}
          <line x1={LEFT} x2={LEFT} y1={TOP - 10} y2={TOP + plotH} stroke={c.muted} strokeWidth={2} />
        </g>
        {sorted.map((r, i) => {
          const t = draw(frame, fps, begin + i * stagger)
          const y = TOP + i * lane + (lane - barH) / 2
          const end = LEFT + (X(r.seconds) - LEFT) * t
          const color = c.series[i % 2 === 0 ? 0 : 1]
          return (
            <g key={`${r.label}-${i}`}>
              <text x={LEFT - 24} y={y + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={TYPE.label} fontWeight={600} fill={c.ink} fontFamily={FONT.family} opacity={axis}>
                {r.label}
              </text>
              <defs>
                <linearGradient id={`hl-${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={pale(color, 0.45)} />
                  <stop offset="100%" stopColor={color} />
                </linearGradient>
              </defs>
              {end > LEFT + 1 && <rect x={LEFT} y={y} width={end - LEFT} height={barH} rx={barH / 4} fill={`url(#hl-${i})`} />}
              <text x={end + 18} y={y + barH / 2} dominantBaseline="middle" fontSize={TYPE.caption} fontWeight={700} fill={color} fontFamily={FONT.family} opacity={t >= 1 ? fade(frame, fps, begin + i * stagger + sec(MOTION.draw, fps) - 4) : 0}>
                {r.text}
              </text>
            </g>
          )
        })}
      </svg>

      <div style={{ position: "absolute", left: LAYOUT.safe, bottom: 40, fontSize: TYPE.small, color: c.muted, opacity: foot }}>{source}</div>
    </AbsoluteFill>
  )
}
