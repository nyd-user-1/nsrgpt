"use client"

import * as React from "react"

// The captures are the whole window, 1440 × 900, the app shell inset 18 px with its own 1 px border. `crop` cuts those
// 19 px off every side, so the shell runs edge to edge inside a card's border and under its rounded corners instead
// of drawing a second frame inside the first (Brendan, 2026-11-07).
const CROP = { width: `${(1440 / 1402) * 100}%`, left: `${(-19 / 1402) * 100}%`, top: `${(-19 / 862) * 100}%` }

/** A docs picture (2026-11-07). Until its file is up, or if it fails, a quiet panel holds its place, naming it. */
export function DocImage({ src, alt, className = "", crop = false }: { src: string; alt: string; className?: string; crop?: boolean }) {
  const [failed, setFailed] = React.useState(false)
  const placeholder = (cls: string) => (
    <span className={`flex items-center justify-center bg-[var(--paper-quiet)] px-6 text-center text-[13px] text-[var(--paper-faint)] ${cls}`} role="img" aria-label={alt}>
      {alt}
    </span>
  )
  if (crop)
    return (
      <span className={`relative block aspect-[1402/862] w-full overflow-hidden ${className}`}>
        {failed ? (
          placeholder("absolute inset-0")
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="absolute max-w-none" style={CROP} />
        )}
      </span>
    )
  if (failed) return placeholder(className)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />
}
