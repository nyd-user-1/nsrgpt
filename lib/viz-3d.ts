// The 3D charts' one camera behaviour (Brendan, 2026-11-05): every 3D chart turns slowly on open, stops for good on
// the first press, drag or scroll, and zooms with the scroll wheel. ECharts-GL charts take GL_VIEW in their grid3D
// viewControl; the three.js scenes use SpinControls (lib/viz-3d-controls.tsx) in place of OrbitControls. This
// file imports nothing, so an ECharts chart that reads GL_VIEW doesn't pull three.js into its bundle.

/** Degrees a second. */
export const SPIN_DEG_PER_S = 3

/** grid3D viewControl. autoRotateAfterStill 0: once a press or scroll stops the turn, it doesn't start again. */
export const GL_VIEW = { autoRotate: true, autoRotateSpeed: SPIN_DEG_PER_S, autoRotateAfterStill: 0, zoomSensitivity: 1 } as const

/** The camera keys' speeds (2026-11-06), shared by SpinControls and the WebGPU particle scene: radians a second the
 *  arrows orbit and tilt at, and the fraction of the distance a second + − zoom and Shift pans by. */
export const CAMERA_ROT = 1.2
export const CAMERA_ZOOM = 1.6
export const CAMERA_PAN = 0.6
export const CAMERA_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'])
/** The frame's list of them (components/viz/FramedBox.tsx). */
export const CAMERA_KEY_LIST = '← → orbit · ↑ ↓ tilt · Cmd + ↑ ↓ or + − zoom · Shift + arrows pan · Space rotation · 0 reset · Esc leave'
