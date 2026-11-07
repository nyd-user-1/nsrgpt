"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { NARRATORS } from "@/lib/docs/media"

/** NarratedVideo (2026-11-07): pax-trinity's docs video (components/docs/narrated-video.tsx) in the paper's dress.
 *  Each voice is its own render, <name><suffix>.mp4; picking another swaps the file and carries on from the same
 *  moment, playing if it was. The menu is the site's own, never the browser's select. */
export function NarratedVideo({ src, alt }: { src: string; alt: string }) {
  const base = src.replace(/\.mp4$/i, "")
  const [voice, setVoice] = React.useState(NARRATORS[0]!.id)
  const video = React.useRef<HTMLVideoElement>(null)
  const resume = React.useRef<{ at: number; playing: boolean } | null>(null)
  const narrator = NARRATORS.find((n) => n.id === voice) ?? NARRATORS[0]!
  const pick = (id: string) => {
    const v = video.current
    if (v) resume.current = { at: v.currentTime, playing: !v.paused }
    setVoice(id)
  }
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] shadow-e2">
        {/* The captions are drawn into the video, and the narrator reads them. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={video}
          key={narrator.id}
          src={`${base}${narrator.suffix}.mp4`}
          poster={`${base}.jpg`}
          controls
          playsInline
          preload={resume.current ? "auto" : "none"}
          onLoadedMetadata={(e) => {
            const r = resume.current
            if (!r) return
            resume.current = null
            e.currentTarget.currentTime = r.at
            if (r.playing) void e.currentTarget.play()
          }}
          className="block aspect-[16/10] w-full bg-[var(--paper-quiet)]"
        />
      </div>
      <figcaption className="mt-2.5 flex items-center justify-between gap-4 text-[13px] text-[var(--paper-faint)]">
        <span>{alt}</span>
        {NARRATORS.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-[var(--paper-faint)] outline-none hover:bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))] hover:text-[var(--paper-text)] data-[state=open]:bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))]"
              >
                Narrator: <span className="font-medium text-[var(--paper-text)]">{narrator.label}</span>
                <ChevronDown aria-hidden className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="nysgpt-app w-max min-w-44 rounded-xl border-[var(--paper-rule)] bg-[var(--paper)] p-1 text-[var(--paper-text)]">
              <DropdownMenuRadioGroup value={voice} onValueChange={pick}>
                {NARRATORS.map((n) => (
                  <DropdownMenuRadioItem key={n.id} value={n.id} className="text-[13px] focus:bg-[var(--paper-quiet)] focus:text-[var(--paper-text)]">
                    <span className="flex-1">{n.label}</span>
                    <span className="ml-4 text-xs text-[var(--paper-faint)]">{n.provider}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </figcaption>
    </figure>
  )
}
