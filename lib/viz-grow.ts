// Page transitions (Brendan, 2026-11-06), all one container transform: a paper clone between the masthead's wordmark
// spot, top left, and the main container — the content area below Panel 1's header.
//   ChartForward — the clone grows from the wordmark's spot over the page, the route changes under it, and it goes
//                  once the next page is up. Every page change, and every page's first load, except the index's.
//   ChartRoot    — the index: the clone covers the content area as / arrives (or first loads) and shrinks onto the
//                  masthead's main box, then fades.
//   ChartBack    — ChartForward in reverse, for the previous-chart button: the clone covers the content area as the
//                  page arrives and shrinks into the main container's top-left corner.
// The index's boxes run ChartForward from their own component (app/(site)/(plate)/viz/expand-box.tsx); the rest run
// from components/PageMotion.tsx and the header's chart buttons.

export const GROW_MS = 420
export const GROW_EASE = 'cubic-bezier(0.25,0.4,0.25,1)'

/** Where the wordmark sat inside the content area, noted by the index's last box press. */
const ORIGIN = 'viz-origin'
const ORIGIN_DEFAULT = { l: 56, t: 32, w: 300, h: 170 }

type Rect = { left: number; top: number; width: number; height: number }

export function noteOrigin(from: Rect, to: Rect) {
  try {
    sessionStorage.setItem(ORIGIN, JSON.stringify({ l: from.left - to.left, t: from.top - to.top, w: from.width, h: from.height }))
  } catch {}
}

/** The main container: a chart's frame, or else Panel 1's card below its header. */
function mainRect(): Rect | null {
  const frame = document.querySelector('[data-viz-frame]')
  if (frame) return frame.getBoundingClientRect()
  const card = document.querySelector('[data-app-card]')?.getBoundingClientRect()
  const head = document.querySelector('[data-main-header]')?.getBoundingClientRect()
  if (!card || !head) return null
  return { left: card.left, top: head.bottom, width: card.width, height: card.bottom - head.bottom }
}

function originIn(to: Rect): Rect {
  let o = ORIGIN_DEFAULT
  try {
    o = { ...ORIGIN_DEFAULT, ...JSON.parse(sessionStorage.getItem(ORIGIN) ?? '{}') }
  } catch {}
  return { left: to.left + o.l, top: to.top + o.t, width: o.w, height: o.h }
}

const px = (v: number) => `${v}px`
const SMALL = { borderRadius: '16px', borderColor: 'var(--paper-rule)', opacity: '0.98' }
const FULL = { borderRadius: '0 0 15px 15px', borderColor: 'transparent', opacity: '1' }
const at = (r: Rect) => ({ left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height) })

/** Runs `fn` once the page has settled: on a first load the main thread is busy hydrating, and a move started then
 *  would jump to its end. */
function whenSettled(fn: () => void) {
  const ric = (window as { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(() => requestAnimationFrame(fn), { timeout: 700 })
  else window.setTimeout(fn, 250)
}

/** A clone at `from`, moved to `to` on the next frame (or once the page settles, on a first load); `moved` runs as
 *  the move starts. */
function clone(mark: string, from: Rect, to: Rect, start: object, end: object, first = false, moved?: () => void) {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute(mark, '')
  el.className = 'nysgpt-app'
  Object.assign(el.style, { position: 'fixed', zIndex: '90', overflow: 'hidden', boxSizing: 'border-box', borderWidth: '1px', borderStyle: 'solid', background: 'var(--paper)', ...at(from), ...start })
  document.body.appendChild(el)
  const move = () => {
    void el.getBoundingClientRect()
    el.style.transition = [...['left', 'top', 'width', 'height', 'border-radius', 'border-color'].map((p) => `${p} ${GROW_MS}ms ${GROW_EASE}`), 'opacity 160ms ease-out'].join(', ')
    Object.assign(el.style, { ...at(to), ...end })
    moved?.()
  }
  if (first) whenSettled(move)
  else move()
  return el
}

/** Fades a shrinking clone out once it lands, then takes it away. */
function fadeAway(el: HTMLElement) {
  window.setTimeout(() => (el.style.opacity = '0'), GROW_MS)
  window.setTimeout(() => el.remove(), GROW_MS + 180)
}

/** The first load's cover is up: the content area, hidden until now (app/layout.tsx, globals.css), can show. */
const uncover = () => document.documentElement.removeAttribute('data-motion-first')

/** ChartForward: grows over the page, then runs `go`. The clone stays until removeGrow, when the next page is up. */
export function chartForward(go: () => void) {
  const to = mainRect()
  if (!to || document.querySelector('[data-viz-grow]')) return go()
  clone('data-viz-grow', originIn(to), to, SMALL, FULL)
  window.setTimeout(go, GROW_MS)
}

/** Takes ChartForward's clone away once the next page is up. */
export function removeGrow() {
  document.querySelectorAll('[data-viz-grow]').forEach((e) => e.remove())
}

/** ChartForward on a page's first load: the content area starts blank and the clone grows over it. */
export function chartForwardFirst() {
  const to = mainRect()
  if (!to) return uncover()
  const veil = document.createElement('div')
  veil.setAttribute('aria-hidden', 'true')
  veil.className = 'nysgpt-app'
  Object.assign(veil.style, { position: 'fixed', zIndex: '89', background: 'var(--paper)', ...at(to) })
  document.body.appendChild(veil)
  const el = clone('data-viz-first', originIn(to), to, SMALL, FULL, true, () =>
    window.setTimeout(() => {
      veil.remove()
      el.remove()
    }, GROW_MS + 40),
  )
  uncover()
}

/** ChartRoot: covers the content area and shrinks onto the masthead's main box. */
export function chartRoot(first = false) {
  const to = mainRect()
  if (!to) return uncover()
  const word = document.querySelector('[data-inspect="Wordmark"]')?.getBoundingClientRect()
  const el: HTMLElement = clone('data-viz-root', to, word ?? originIn(to), FULL, SMALL, first, () => fadeAway(el))
  uncover()
}

/** ChartBack: covers the content area and shrinks into its top-left corner. */
export function chartBack() {
  const to = mainRect()
  if (!to) return
  fadeAway(clone('data-viz-back', to, { left: to.left, top: to.top, width: 0, height: 0 }, FULL, SMALL))
}

/** The previous-chart button asks for ChartBack on the next page's arrival. */
let backNext = false
export const markBack = () => (backNext = true)
export function takeBack() {
  const b = backNext
  backNext = false
  return b
}
