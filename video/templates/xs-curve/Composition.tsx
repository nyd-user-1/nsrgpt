import * as React from "react"
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion"

import { CLAMP, enter, fade } from "../../motion"
import { decades, fmt, sup } from "../../scale"
import { FONT, LAYOUT, TYPE, palette, sec } from "../../theme"
import type { XsCurveProps } from "./schema"

// A cross section, log-log. The axes fade in; each library's curve draws from low energy to high behind a leading
// dot, all together; each measured point springs in with its error bar as the reveal passes its energy; a callout
// springs in where the reveal passes its energy; the legend and the source come last.

const REVEAL = [0.8, 6.8] as const // seconds
const TOP = 210
const BOTTOM = 190
const LEFT = 200
const RIGHT = 120

export function XsCurveComposition({ title, subtitle, series, measured = [], xLabel, yLabel, annotation, source, theme }: XsCurveProps) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const c = palette(theme)
  const head = enter(frame, fps)
  const axes = fade(frame, fps, sec(0.3, fps))

  const xs = [...series.flatMap((s) => s.points.map((p) => p[0])), ...measured.flatMap((m) => m.points.map((p) => p[0]))]
  const ys = [...series.flatMap((s) => s.points.map((p) => p[1])), ...measured.flatMap((m) => m.points.map((p) => p[1]))]
  const lx0 = Math.log10(Math.min(...xs))
  const lx1 = Math.log10(Math.max(...xs)) > lx0 ? Math.log10(Math.max(...xs)) : lx0 + 1
  const ly0 = Math.floor(Math.log10(Math.min(...ys)))
  const ly1 = Math.max(Math.ceil(Math.log10(Math.max(...ys))), ly0 + 1)
  const plotW = width - LEFT - RIGHT
  const plotH = height - TOP - BOTTOM
  const X = (v: number) => LEFT + ((Math.log10(v) - lx0) / (lx1 - lx0)) * plotW
  const Y = (v: number) => TOP + plotH - ((Math.log10(v) - ly0) / (ly1 - ly0)) * plotH

  // The reveal's head, in log energy; and the frame at which it reaches an energy.
  const f0 = sec(REVEAL[0], fps)
  const f1 = sec(REVEAL[1], fps)
  const lHead = interpolate(frame, [f0, f1], [lx0, lx1], CLAMP)
  const reach = (v: number) => Math.round(f0 + ((Math.log10(v) - lx0) / (lx1 - lx0)) * (f1 - f0))
  const done = frame >= f1
  const after = fade(frame, fps, f1)

  const xTicks = decades(Math.pow(10, lx0), Math.pow(10, lx1)).filter((v) => Math.log10(v) >= lx0 - 1e-9 && Math.log10(v) <= lx1 + 1e-9)
  const xEvery = Math.max(1, Math.ceil(xTicks.length / 9))
  const yTicks = Array.from({ length: ly1 - ly0 + 1 }, (_, i) => Math.pow(10, ly0 + i))
  const yEvery = Math.max(1, Math.ceil(yTicks.length / 7))
  const legend = [...series.map((s, i) => ({ name: s.name, color: c.series[i], dot: false })), ...(measured.length ? [{ name: measured.length === 1 ? measured[0].name : `EXFOR, ${measured.length} measurements`, color: c.measured, dot: true }] : [])]

  return (
    <AbsoluteFill style={{ backgroundColor: c.ground, fontFamily: FONT.family, color: c.ink }}>
      <div style={{ position: "absolute", left: LAYOUT.safe, right: LAYOUT.safe, top: LAYOUT.safe - 10, opacity: head, transform: `translateY(${(1 - head) * 24}px)` }}>
        <div style={{ fontSize: TYPE.heading, fontWeight: 700, letterSpacing: -0.5 }}>{title}</div>
        {subtitle && <div style={{ marginTop: 6, fontSize: TYPE.caption, color: c.muted }}>{subtitle}</div>}
      </div>

      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <clipPath id="xs-plot">
            <rect x={LEFT - 14} y={TOP - 14} width={plotW + 28} height={plotH + 28} />
          </clipPath>
        </defs>
        <g opacity={axes}>
          {yTicks.map((t, i) => (
            <g key={t}>
              <line x1={LEFT} x2={LEFT + plotW} y1={Y(t)} y2={Y(t)} stroke={c.rule} strokeWidth={i === 0 ? 2 : 1} />
              {i % yEvery === 0 && (
                <text x={LEFT - 18} y={Y(t)} textAnchor="end" dominantBaseline="middle" fontSize={TYPE.small} fill={c.faint} fontFamily={FONT.family}>
                  10{sup(Math.round(Math.log10(t)))}
                </text>
              )}
            </g>
          ))}
          {xTicks.map((t, i) => (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={TOP} y2={TOP + plotH} stroke={c.rule} strokeWidth={1} />
              {i % xEvery === 0 && (
                <text x={X(t)} y={TOP + plotH + 40} textAnchor="middle" fontSize={TYPE.small} fill={c.faint} fontFamily={FONT.family}>
                  10{sup(Math.round(Math.log10(t)))}
                </text>
              )}
            </g>
          ))}
          <text x={LEFT + plotW / 2} y={TOP + plotH + 96} textAnchor="middle" fontSize={TYPE.small} fill={c.muted} fontFamily={FONT.family}>
            {xLabel}
          </text>
          <text x={56} y={TOP + plotH / 2} textAnchor="middle" fontSize={TYPE.small} fill={c.muted} fontFamily={FONT.family} transform={`rotate(-90 56 ${TOP + plotH / 2})`}>
            {yLabel}
          </text>
        </g>

        <g clipPath="url(#xs-plot)">
          {measured.map((m) =>
            m.points.map((p, i) => {
              const t = enter(frame, fps, reach(p[0]))
              if (t <= 0.001) return null
              const dy = p[2] ?? 0
              return (
                <g key={`${m.name}-${i}`} opacity={Math.min(1, t)}>
                  {dy > 0 && p[1] - dy > 0 && <line x1={X(p[0])} x2={X(p[0])} y1={Y(p[1] + dy)} y2={Y(p[1] - dy)} stroke={c.measured} strokeWidth={2} opacity={0.6} />}
                  <circle cx={X(p[0])} cy={Y(p[1])} r={6 * t} fill={c.measured} />
                </g>
              )
            }),
          )}
          {series.map((s, si) => {
            const shown = s.points.filter((p) => Math.log10(p[0]) <= lHead)
            if (shown.length < 1) return null
            const tip = shown[shown.length - 1]
            const color = c.series[si]
            return (
              <g key={s.name}>
                <polyline points={shown.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
                {!done && <circle cx={X(tip[0])} cy={Y(tip[1])} r={10} fill={color} stroke={c.ground} strokeWidth={3} />}
              </g>
            )
          })}
        </g>
      </svg>

      {annotation && Math.log10(annotation.x) >= lx0 && Math.log10(annotation.x) <= lx1 && (
        <Callout x={X(annotation.x)} top={TOP + 24} text={annotation.text} t={enter(frame, fps, reach(annotation.x))} right={X(annotation.x) > width / 2} card={c.card} ink={c.accent} rule={c.rule} />
      )}

      <div style={{ position: "absolute", right: LAYOUT.safe, top: TOP + 12, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, opacity: after }}>
        {legend.map((l) => (
          <span key={l.name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: TYPE.caption, color: c.secondary, backgroundColor: c.ground, padding: "2px 8px", borderRadius: 8 }}>
            {l.dot ? <span style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: l.color }} /> : <span style={{ width: 32, height: 6, borderRadius: 3, backgroundColor: l.color }} />}
            {l.name}
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safe, bottom: 40, fontSize: TYPE.small, color: c.muted, opacity: after }}>
        {source}
        {measured.length > 0 && ` · ${fmt(measured.reduce((n, m) => n + m.points.length, 0))} measured points shown`}
      </div>
    </AbsoluteFill>
  )
}

/** A label hung from the top of the plot at its energy, with a hairline down to the axis. */
function Callout({ x, top, text, t, right, card, ink, rule }: { x: number; top: number; text: string; t: number; right: boolean; card: string; ink: string; rule: string }) {
  if (t <= 0.001) return null
  return (
    <div style={{ position: "absolute", left: x, top, opacity: Math.min(1, t), transform: `translateX(${right ? "-100%" : "0"}) scale(${0.85 + 0.15 * Math.min(1, t)})`, transformOrigin: right ? "top right" : "top left" }}>
      <div style={{ borderLeft: right ? undefined : `2px solid ${rule}`, borderRight: right ? `2px solid ${rule}` : undefined, padding: "0 16px" }}>
        <div style={{ padding: "12px 20px", borderRadius: 14, backgroundColor: card, boxShadow: "0 8px 24px rgb(15 23 42 / 0.10)", fontSize: TYPE.label, fontWeight: 600, color: ink, whiteSpace: "nowrap" }}>{text}</div>
      </div>
    </div>
  )
}
