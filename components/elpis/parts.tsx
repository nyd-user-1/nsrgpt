// /elpis (brief 67): what every Elpis page shares, safe on the server and the client. After a label, ❌ marks what
// JANIS has and I do not, ✅ what I have and JANIS does not; no mark where both hold it (Brendan, 23:45 ET).
import { cn } from "@/lib/utils"
import type { Mark as MarkKind } from "@/lib/janis-tree"

export const LINE = "border-[color-mix(in_oklab,var(--paper-rule)_15%,transparent)]"
export const TINT = "bg-[var(--paper-quiet)]"
export const HOVER = "hover:bg-[color-mix(in_oklab,var(--paper-text)_6%,var(--paper))]"
export const LINK = "text-[var(--paper-strong)] hover:underline"

/** The mark after a label: ❌ JANIS has it and I do not; ✅ I have it and JANIS does not; nothing where both do. */
export function Mark({ kind, className }: { kind: MarkKind; className?: string }) {
  if (kind === "same") return null
  const [glyph, label] = kind === "missing" ? ["❌", "JANIS has it, I do not yet"] : ["✅", "I have it, JANIS does not"]
  return <span role="img" aria-label={label} title={label} className={cn("ml-1.5 inline-block text-[0.72em] leading-none", className)}>{glyph}</span>
}

/** ❌ alone, for the home cards and the nav item JANIS has and I do not. */
export const Gap = ({ className }: { className?: string }) => <Mark kind="missing" className={className} />

export const SEARCHES = [
  { key: "endf", name: "ENDF" },
  { key: "exfor", name: "EXFOR" },
  { key: "cinda", name: "CINDA" },
  { key: "resonances", name: "Resonances" },
  { key: "decay", name: "Decay lines" },
  { key: "covariances", name: "Covariances" },
] as const
