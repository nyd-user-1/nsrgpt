"use client"

import * as React from "react"
import { Player, type PlayerRef } from "@remotion/player"

import { cn } from "@/lib/utils"
import { getTemplate, validate } from "@/video/registry"

// trinity's TemplatePlayer (src/components/video/TemplatePlayer.tsx): a template, filled and played in the page. The props
// pass the template's schema first (video/registry.ts validate), then Remotion's Player draws them live in the browser,
// so nothing is rendered to a file. Controls on, no loop. It rests on its last frame, the finished picture; the first
// time it scrolls into view it plays once from the top (brief 78), unless the reader prefers reduced motion. Play
// replays it. A wide (16:9) template takes the column's width; a vertical (9:16) one stands centred at phone width.

export function TemplatePlayer({ templateId, props, className }: { templateId: string; props: unknown; className?: string }) {
  const v = React.useMemo(() => validate(templateId, props), [templateId, props])
  const ref = React.useRef<PlayerRef>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const played = React.useRef(false)
  React.useEffect(() => {
    const el = box.current
    if (!el || played.current || !v.ok) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || played.current) return
        played.current = true
        io.disconnect()
        ref.current?.seekTo(0)
        // After the seek has landed; a start without a click, so no audio tags (numberOfSharedAudioTags below).
        requestAnimationFrame(() => ref.current?.play())
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [v.ok])
  const quiet = cn("rounded-xl border border-[var(--paper-rule)] bg-[var(--paper-quiet)] px-4 py-3 text-sm text-[var(--paper-muted)]", className)

  if (!v.ok) return <div className={quiet}>This chart could not be drawn.</div>

  const t = getTemplate(v.spec.id)
  if (!t) return <div className={quiet}>This chart could not be drawn.</div>
  const vertical = t.height > t.width
  return (
    <div ref={box} className={cn("w-full", vertical && "mx-auto max-w-[360px]", className)}>
      <Player
        ref={ref}
        component={t.component}
        inputProps={v.props as Record<string, unknown>}
        durationInFrames={v.durationInFrames}
        fps={t.fps}
        compositionWidth={t.width}
        compositionHeight={t.height}
        controls
        autoPlay={false}
        loop={false}
        // The charts have no sound. Unmuted, the Player waits for its audio context to resume before it advances a frame,
        // and the browser resumes one only after a click: a play started as the chart scrolls into view stalled on frame 0.
        initiallyMuted
        numberOfSharedAudioTags={0}
        initialFrame={v.durationInFrames - 1}
        className="overflow-hidden rounded-xl shadow-sm ring-1 ring-[var(--paper-rule)]"
        style={{ width: "100%", aspectRatio: `${t.width} / ${t.height}` }}
      />
    </div>
  )
}
