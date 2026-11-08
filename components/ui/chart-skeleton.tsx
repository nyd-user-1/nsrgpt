import { Skeleton } from "@/components/ui/nova/skeleton"
import { cn } from "@/lib/utils"

/** A chart's place while its code or data loads (2026-11-08): the design system's Skeleton, filling the chart's
 *  box. The /viz frame (VizShell) shows it until the chart draws; the chart code's next/dynamic boundaries show
 *  it while that code loads. */
export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("min-h-0 flex-1 rounded-xl", className)} />
}
