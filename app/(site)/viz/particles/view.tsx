'use client'

import dynamic from 'next/dynamic'

// The scene is WebGPU three.js — browser only, and loaded with the page rather than in the shared bundle.
const ParticleScene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1" />,
})

export function ParticleView() {
  return <ParticleScene />
}
