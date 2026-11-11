"use client"
// /janis (brief 67): JANIS Web's own nav strip (mark, Browse, Search menu, Books menu, TRANS Checker), in the paper tokens.
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, ChevronDown, CircleCheck, Network, Search } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { PROJECTILES } from "@/lib/janis-tree"
import { cn } from "@/lib/utils"
import { Gap, HOVER, LINE, SEARCHES, TINT } from "@/components/janis/parts"

const ITEM = "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-[var(--paper-text)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--paper-strong)]"

export function JanisNav() {
  const path = usePathname()
  const on = (p: string) => path === p || path.startsWith(`${p}/`)
  return (
    <nav className={cn("flex flex-wrap items-center gap-1 border-b px-4 py-2 sm:px-6", LINE)} aria-label="JANIS">
      <Link href="/janis" className={cn("mr-3 inline-flex items-center gap-2 text-lg tracking-tight text-[var(--paper-text)]")} style={SERIF}>
        <Network className="size-4 text-[var(--paper-muted)]" aria-hidden="true" />
        JANIS Web
      </Link>
      <Link href="/janis/browse" className={cn(ITEM, HOVER, on("/janis/browse") && TINT)}>
        <Network className="size-4 text-[var(--paper-muted)]" aria-hidden="true" />Browse
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(ITEM, HOVER, on("/janis/search") && TINT)}>
          <Search className="size-4 text-[var(--paper-muted)]" aria-hidden="true" />Search<ChevronDown className="size-3.5 text-[var(--paper-muted)]" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SEARCHES.map((s) => (
            <DropdownMenuItem key={s.key} asChild><Link href={`/janis/search/${s.key}`}>{s.name}</Link></DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(ITEM, HOVER, on("/janis/book") && TINT)}>
          <BookOpen className="size-4 text-[var(--paper-muted)]" aria-hidden="true" />Books<ChevronDown className="size-3.5 text-[var(--paper-muted)]" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PROJECTILES.map((p) => (
            <DropdownMenuItem key={p.key} asChild>
              <Link href={`/janis/book/${p.key}`}><strong className="w-4 font-mono">{p.symbol}</strong>{p.name}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className={cn(ITEM, "cursor-default text-[var(--paper-muted)]")}>
        <CircleCheck className="size-4" aria-hidden="true" />TRANS Checker<Gap />
      </span>
    </nav>
  )
}
