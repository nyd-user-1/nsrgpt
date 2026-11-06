'use client'

import * as React from 'react'
import { OrbitControls } from '@react-three/drei'
import { SPIN_DEG_PER_S } from '@/lib/viz-3d'

/** OrbitControls that turn slowly until the first press, drag or scroll (lib/viz-3d.ts), then stay where they're
 *  left; the wheel zooms. `stopped` ends the turn from outside, for a scene that flies its own camera to a selection. */
export function SpinControls({ stopped = false, onStart, ...props }: React.ComponentProps<typeof OrbitControls> & { stopped?: boolean }) {
  const [touched, setTouched] = React.useState(false)
  return (
    <OrbitControls
      {...props}
      enableZoom
      // OrbitControls' 1 is 6° a second at 60 frames a second.
      autoRotate={!touched && !stopped}
      autoRotateSpeed={SPIN_DEG_PER_S / 6}
      onStart={(e) => {
        setTouched(true)
        onStart?.(e)
      }}
    />
  )
}
