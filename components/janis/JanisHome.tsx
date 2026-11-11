// /janis (brief 67): JANIS Web's home page as theirs, two columns of cards: Browse, Search and Open .jns file on the
// left; Books and TRANS Checker on the right. Their teal buttons are the house primary button; the two cards I do not
// have carry ❌, and the foot counts the three marks (JanisCounts).
import Link from "next/link"
import { BookOpen, CircleCheck, File, Network, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { Gap, LINE, SEARCHES, TINT } from "@/components/janis/parts"
import { JanisCounts } from "@/components/janis/JanisCounts"
import { PROJECTILES } from "@/lib/janis-tree"
import { cn } from "@/lib/utils"

const WIDE = "h-11 w-full rounded-full text-base"

function Card({ icon: Icon, title, gap, children }: { icon: typeof Network; title: string; gap?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border px-6 py-6 text-center", LINE, TINT)}>
      <h2 className="mb-4 inline-flex items-center justify-center gap-2 text-3xl tracking-tight text-[var(--paper-text)]" style={SERIF}>
        <Icon className="size-6 text-[var(--paper-muted)]" aria-hidden="true" />
        {title}
        {gap && <Gap className="text-[0.5em]" />}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-[var(--paper-text)]">{children}</div>
    </section>
  )
}

export function JanisHome() {
  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card icon={Network} title="Browse">
            <p>Browse the database content.</p>
            <Button asChild className={WIDE}><Link href="/janis/browse">Browse</Link></Button>
          </Card>
          <Card icon={Search} title="Search">
            {SEARCHES.map((s) => (
              <Button key={s.key} asChild className={WIDE}><Link href={`/janis/search/${s.key}`}>{s.name}</Link></Button>
            ))}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card icon={BookOpen} title="Books">
            <p>Comparison of experimental and evaluated cross sections.</p>
            {PROJECTILES.map((p, i) => (
              <Button key={p.key} asChild variant={i === 0 ? "default" : "outline"} className={WIDE}>
                <Link href={`/janis/book/${p.key}`}><strong className="font-mono">{p.symbol}</strong> - {p.name}</Link>
              </Button>
            ))}
          </Card>
        </div>
        <Card icon={File} title="Open .jns file" gap>
          <p>Open a previously saved JANIS file.</p>
          <div className="flex gap-2">
            <input type="file" accept=".jns" disabled aria-label="A .jns file" className={cn("h-11 min-w-0 flex-1 rounded-full border bg-[var(--paper)] px-4 py-2 text-sm text-[var(--paper-muted)] file:mr-3 file:border-0 file:bg-transparent file:text-sm file:text-[var(--paper-text)]", LINE)} />
            <Button disabled className="h-11 rounded-full px-6">Open</Button>
          </div>
        </Card>
        <Card icon={CircleCheck} title="TRANS Checker" gap>
          <p>TRANS Checker tool for EXFOR compilers.</p>
          <Button variant="outline" disabled className={WIDE}>EXFOR TRANS Checker</Button>
        </Card>
      </div>
      <JanisCounts />
    </div>
  )
}
