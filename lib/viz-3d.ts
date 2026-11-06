// The 3D charts' one camera behaviour (Brendan, 2026-11-05): every 3D chart turns slowly on open, stops for good on
// the first press, drag or scroll, and zooms with the scroll wheel. ECharts-GL charts take GL_VIEW in their grid3D
// viewControl; the three.js scenes use SpinControls (lib/viz-3d-controls.tsx) in place of OrbitControls. This
// file imports nothing, so an ECharts chart that reads GL_VIEW doesn't pull three.js into its bundle.

/** Degrees a second. */
export const SPIN_DEG_PER_S = 3

/** grid3D viewControl. autoRotateAfterStill 0: once a press or scroll stops the turn, it doesn't start again. */
export const GL_VIEW = { autoRotate: true, autoRotateSpeed: SPIN_DEG_PER_S, autoRotateAfterStill: 0, zoomSensitivity: 1 } as const
