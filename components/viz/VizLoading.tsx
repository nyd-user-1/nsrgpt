import { AtomSpinner } from '@/components/AtomSpinner'
import { cn } from '@/lib/utils'

// What a chart page shows whenever it is waiting (Brendan, 2026-11-11): the atom, centred, in place of the chart
// skeleton. Used by VizShell until the chart's canvas exists, by the charts' lazy loaders, by the route's loading
// fallback and by PageMotion over the grow box while the next chart page is on its way.
export function VizLoading({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center', className)}>
      <AtomSpinner size={40} label="Loading chart" />
    </div>
  )
}
