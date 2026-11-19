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
  const fps = v.ok ? v.spec.fps : 30
  const last = v.ok ? v.durationInFrames - 1 : 0
  React.useEffect(() => {
    const el = box.current
    if (!el || played.current || !v.ok) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let raf = 0
    let stopped = false
    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
    // A click on the player stops the run and hands it the controls.
    el.addEventListener("pointerdown", stop)
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || played.current) return
        played.current = true
        io.disconnect()
        // The first play runs on seeks, frame by frame in real time: the Player's own playback waits for its audio to be
        // allowed, which the browser grants only after a click, and a chart scrolled into view has had none.
        const t0 = performance.now()
        const step = () => {
          if (stopped) return
          const f = Math.min(last, Math.floor(((performance.now() - t0) / 1000) * fps))
          ref.current?.seekTo(f)
          if (f < last) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      stop()
      el.removeEventListener("pointerdown", stop)
    }
  }, [v.ok, fps, last])
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
        // The charts have no sound.
        initiallyMuted
        numberOfSharedAudioTags={0}
        initialFrame={v.durationInFrames - 1}
        className="overflow-hidden rounded-xl shadow-sm ring-1 ring-[var(--paper-rule)]"
        style={{ width: "100%", aspectRatio: `${t.width} / ${t.height}` }}
      />
    </div>
  )
}
