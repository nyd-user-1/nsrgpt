'use client'

import dynamic from 'next/dynamic'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'

// The scene is three.js — browser only, and loaded with the page rather than in the shared bundle.
const DecayScene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
})

export function DecayView() {
  return <DecayScene />
}
