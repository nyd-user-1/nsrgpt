// The charts' pointer (Brendan, 2026-11-06): the dev tools' sonar cross (components/housekeeping/overlay/cursor.ts)
// in place of the plain +. Its centre is open, so the few-pixel dot being aimed at stays in sight, and a faint ring
// marks the nearest-point hover's reach (NEAR, components/viz/use-echart.ts: the dot nearest the pointer within 10 px
// hovers). The sonar's trailing dot is left out: on a scatter it would read as a data point. Ink over a paper halo,
// so it shows on any ground; the colours are the theme's, read when it's set.

const cache = new Map<boolean, string>()

export function scopeCursor(dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')): string {
  const hit = cache.get(dark)
  if (hit) return hit
  const ink = dark ? '#f0e9d8' : '#16181d'
  const halo = dark ? '#15120d' : '#ffffff'
  const arms = 'M16 2v10M16 20v10M2 16h10M20 16h10'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="10" fill="none" stroke="${halo}" stroke-width="3" opacity="0.5"/>` +
    `<circle cx="16" cy="16" r="10" fill="none" stroke="${ink}" stroke-width="1" opacity="0.4"/>` +
    `<path d="${arms}" stroke="${halo}" stroke-width="3"/>` +
    `<path d="${arms}" stroke="${ink}" stroke-width="1"/>` +
    `</svg>`
  const value = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`
  cache.set(dark, value)
  return value
}
