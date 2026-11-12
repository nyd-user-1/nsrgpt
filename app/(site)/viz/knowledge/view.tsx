'use client'

import dynamic from 'next/dynamic'
import { VizLoading } from '@/components/viz/VizLoading'

// The scene is three.js — browser only, and loaded with the page rather than in the shared bundle.
const KnowledgeScene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <VizLoading />,
})

export function KnowledgeView() {
  return <KnowledgeScene />
}
