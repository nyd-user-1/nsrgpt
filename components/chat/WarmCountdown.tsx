"use client"

import { useEffect, useRef, useState } from "react"

// hq's prompt-cache countdown (app/ui/terminal.tsx, the header meter), repurposed for the search
// backend (2026-11-07): it counts down from the last Lambda call to when Lambda unloads the function,
// then flashes "cold" in blue and fades out. Same mechanics: a 1s tick only while warm, and an
// edge-detected one-shot for the flash so a page that opens on an already-cold backend doesn't flash.

export function WarmCountdown({ lastCall, ttlMs, label = "warm" }: { lastCall: number | null; ttlMs: number; label?: string }) {
  const [now, setNow] = useState(0)

  // Tick 1s while the window is open, so the countdown stays live.
  useEffect(() => {
    if (!lastCall || Date.now() - lastCall >= ttlMs) return
    setNow(Date.now())
    const t = setInterval(() => {
      setNow(Date.now())
      if (Date.now() - lastCall >= ttlMs) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  }, [lastCall, ttlMs])

  // Cold flash: the instant the countdown hits 0, show "cold", then fade it out (~5s total). Armed
  // while warm, fired only when the window JUST closed (the 2s guard).
  const [coldFlash, setColdFlash] = useState<"off" | "on" | "out">("off")
  const coldFiredRef = useRef(false)
  const [coldFireSeq, setColdFireSeq] = useState(0)
  useEffect(() => {
    const left = lastCall !== null && now > 0 ? ttlMs - (now - lastCall) : null
    if (left !== null && left > 0) {
      coldFiredRef.current = false
      setColdFlash((s) => (s === "off" ? s : "off"))
      return
    }
    if (left === null || coldFiredRef.current || -left >= 2000) return
    coldFiredRef.current = true
    setColdFireSeq((n) => n + 1)
  }, [lastCall, now, ttlMs])
  useEffect(() => {
    if (coldFireSeq === 0) return
    setColdFlash("on")
    const out = setTimeout(() => setColdFlash("out"), 3000)
    const gone = setTimeout(() => setColdFlash("off"), 5000)
    return () => {
      clearTimeout(out)
      clearTimeout(gone)
    }
  }, [coldFireSeq])

  const left = lastCall !== null && now > 0 ? ttlMs - (now - lastCall) : null
  return (
    <>
      {left !== null && left > 0 && (
        <span className="font-mono text-[11px] text-amber-500">
          {label} {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
        </span>
      )}
      {coldFlash !== "off" && (
        <span className={`font-mono text-[11px] text-blue-500 transition-opacity duration-[1500ms] ease-out ${coldFlash === "out" ? "opacity-0" : "opacity-100"}`}>
          cold
        </span>
      )}
    </>
  )
}
