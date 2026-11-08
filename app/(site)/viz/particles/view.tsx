'use client'

import dynamic from 'next/dynamic'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'

// The scene is WebGPU three.js — browser only, and loaded with the page rather than in the shared bundle.
const ParticleScene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
})

export function ParticleView() {
  return <ParticleScene />
}
