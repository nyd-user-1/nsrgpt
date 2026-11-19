"use client"

import * as React from "react"
import { Player } from "@remotion/player"

import { cn } from "@/lib/utils"
import { getTemplate, validate } from "@/video/registry"

// trinity's TemplatePlayer (src/components/video/TemplatePlayer.tsx): a template, filled and played in the page. The props
// pass the template's schema first (video/registry.ts validate), then Remotion's Player draws them live in the browser,
// so nothing is rendered to a file. Controls on, autoplay and loop off. It waits on its last frame, the finished picture,
// and play starts it from the top. A wide (16:9) template takes the column's width; a vertical (9:16) one stands centred
// at phone width.

export function TemplatePlayer({ templateId, props, className }: { templateId: string; props: unknown; className?: string }) {
  const v = React.useMemo(() => validate(templateId, props), [templateId, props])
  const quiet = cn("rounded-xl border border-[var(--paper-rule)] bg-[var(--paper-quiet)] px-4 py-3 text-sm text-[var(--paper-muted)]", className)

  if (!v.ok) return <div className={quiet}>This chart could not be drawn.</div>

  const t = getTemplate(v.spec.id)
  if (!t) return <div className={quiet}>This chart could not be drawn.</div>
  const vertical = t.height > t.width
  return (
    <div className={cn("w-full", vertical && "mx-auto max-w-[360px]", className)}>
      <Player
        component={t.component}
        inputProps={v.props as Record<string, unknown>}
        durationInFrames={v.durationInFrames}
        fps={t.fps}
        compositionWidth={t.width}
        compositionHeight={t.height}
        controls
        autoPlay={false}
        loop={false}
        initialFrame={v.durationInFrames - 1}
        className="overflow-hidden rounded-xl shadow-sm ring-1 ring-[var(--paper-rule)]"
        style={{ width: "100%", aspectRatio: `${t.width} / ${t.height}` }}
      />
    </div>
  )
}
