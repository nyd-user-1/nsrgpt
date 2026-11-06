'use client'

import dynamic from 'next/dynamic'

// The scene is three.js — browser only, and loaded with the page rather than in the shared bundle.
const Knowledge3dScene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1" />,
})

export function Knowledge3dView() {
  return <Knowledge3dScene />
}
