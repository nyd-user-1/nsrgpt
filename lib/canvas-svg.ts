// The /graph canvas as an SVG file (brief 33, Part 2: the bottom-right Export). Native SVG, no foreignObject, so the file
// opens in Illustrator or Inkscape and goes into a paper: each node's boxes become rects and circles drawn from their
// laid-out size and computed style, each line of text becomes an SVG <text> on its laid-out baseline, icons and the
// N-Z axes are copied as the SVG they already are, and the arrows are the paths React Flow draws, with their computed
// strokes written onto them. The frame is the whole canvas (every node, arrow and label, the legend among them), at one
// canvas unit to the pixel, whatever the pan and zoom. The colours are the theme's on screen.

type Box = { x: number; y: number; w: number; h: number }

/** UI chrome left out of the file: React Flow's handles and panels, the cards' buttons and grips. */
const SKIP = ".react-flow__handle, .react-flow__resize-control, .react-flow__panel, [data-canvas-skip], [draggable='true']"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const num = (n: number) => String(Math.round(n * 100) / 100)

/** The page's fonts by role, named so another program can find them or a near one. */
function family(css: string): string {
  if (/mono/i.test(css)) return "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
  if (/fraunces|display/i.test(css)) return "Fraunces, Georgia, serif"
  return "'DM Sans', 'Helvetica Neue', Arial, sans-serif"
}

let probe: CanvasRenderingContext2D | null = null
const ctx = () => {
  if (!probe) {
    const c = document.createElement("canvas")
    c.width = c.height = 1
    probe = c.getContext("2d", { willReadFrequently: true })
  }
  return probe as CanvasRenderingContext2D
}

const colorCache = new Map<string, { c: string; a: number } | null>()
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

/** Any computed CSS colour (rgb, oklab, oklch, color()) as an sRGB hex and an opacity; null when it paints nothing. */
function paint(css: string): { c: string; a: number } | null {
  if (!css || css === "none" || css === "transparent") return null
  if (colorCache.has(css)) return colorCache.get(css) ?? null
  let out: { c: string; a: number } | null
  const rgb = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/)
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])
    out = a === 0 ? null : { c: hex(+rgb[1], +rgb[2], +rgb[3]), a }
  } else {
    // other spaces: read the alpha from the string, draw the colour opaque on a 1 px canvas and read it back as sRGB
    const al = css.match(/\/\s*([\d.]+%?)\s*\)$/)
    const a = al ? (al[1].endsWith("%") ? parseFloat(al[1]) / 100 : parseFloat(al[1])) : 1
    const c = ctx()
    c.clearRect(0, 0, 1, 1)
    c.fillStyle = "#000000"
    c.fillStyle = al ? css.replace(/\s*\/\s*[\d.]+%?\s*\)$/, ")") : css
    if (c.fillStyle === "#000000" && !/^(#000(000)?|black)$/i.test(css) && !css.startsWith("oklab(0 ") && !css.startsWith("oklch(0 ")) {
      out = a === 0 ? null : { c: css, a: 1 }
    } else {
      c.fillRect(0, 0, 1, 1)
      const [r, g, b] = c.getImageData(0, 0, 1, 1).data
      out = a === 0 ? null : { c: hex(r, g, b), a }
    }
  }
  colorCache.set(css, out)
  return out
}

const fillAttr = (css: string, name = "fill") => {
  const p = paint(css)
  if (!p) return `${name}="none"`
  return `${name}="${p.c}"${p.a < 1 ? ` ${name}-opacity="${num(p.a)}"` : ""}`
}

const metricCache = new Map<string, { asc: number; desc: number }>()
/** The font's ascent and descent in px, as the browser laid the text out with them. */
function metrics(font: string, size: number): { asc: number; desc: number } {
  const hit = metricCache.get(font)
  if (hit) return hit
  const c = ctx()
  c.font = font
  const m = c.measureText("Hg")
  const out = { asc: m.fontBoundingBoxAscent || size * 0.8, desc: m.fontBoundingBoxDescent || size * 0.2 }
  metricCache.set(font, out)
  return out
}
const fontOf = (cs: CSSStyleDeclaration) => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`

/** Screen pixels to canvas units: the viewport's own box carries React Flow's pan, its transform the zoom. */
function mapper(flow: HTMLElement) {
  const vp = flow.querySelector<HTMLElement>(".react-flow__viewport")
  const r = vp?.getBoundingClientRect() ?? flow.getBoundingClientRect()
  const k = vp ? new DOMMatrixReadOnly(getComputedStyle(vp).transform).a || 1 : 1
  return {
    k,
    box: (b: DOMRect | { left: number; top: number; width: number; height: number }): Box => ({ x: (b.left - r.left) / k, y: (b.top - r.top) / k, w: b.width / k, h: b.height / k }),
  }
}

type Mapper = ReturnType<typeof mapper>

/** An element's background and border as one rect (a circle when it is round), or a fill and per-side strips. */
function boxOf(cs: CSSStyleDeclaration, b: Box): string {
  const bg = paint(cs.backgroundColor)
  const sides = (["Top", "Right", "Bottom", "Left"] as const).map((s) => ({
    w: cs.getPropertyValue(`border-${s.toLowerCase()}-style`) === "none" ? 0 : parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0,
    c: cs.getPropertyValue(`border-${s.toLowerCase()}-color`),
    style: cs.getPropertyValue(`border-${s.toLowerCase()}-style`),
  }))
  const painted = sides.filter((s) => s.w > 0 && paint(s.c))
  if (!bg && !painted.length) return ""
  const rr = cs.borderTopLeftRadius
  const rad = Math.min(rr.endsWith("%") ? (parseFloat(rr) / 100) * b.w : parseFloat(rr) || 0, b.w / 2, b.h / 2)
  const uniform = painted.length === 4 && painted.every((s) => s.w === painted[0].w && s.c === painted[0].c)
  if (uniform || !painted.length) {
    const sw = uniform ? painted[0].w : 0
    const stroke = uniform ? ` ${fillAttr(painted[0].c, "stroke")} stroke-width="${num(sw)}"${painted[0].style === "dashed" ? ' stroke-dasharray="4 3"' : ""}` : ""
    const fill = bg ? `fill="${bg.c}"${bg.a < 1 ? ` fill-opacity="${num(bg.a)}"` : ""}` : 'fill="none"'
    const x = b.x + sw / 2, y = b.y + sw / 2, w = Math.max(0, b.w - sw), h = Math.max(0, b.h - sw)
    if (Math.abs(w - h) < 0.6 && rad >= b.w / 2 - 0.5) return `<circle cx="${num(x + w / 2)}" cy="${num(y + h / 2)}" r="${num(w / 2)}" ${fill}${stroke}/>`
    const rx = Math.max(0, rad - sw / 2)
    return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${rx ? ` rx="${num(rx)}"` : ""} ${fill}${stroke}/>`
  }
  // mixed borders (a card's family edge, a ladder's rung): the fill, then each side as its own strip
  let out = bg ? `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}"${rad ? ` rx="${num(rad)}"` : ""} fill="${bg.c}"${bg.a < 1 ? ` fill-opacity="${num(bg.a)}"` : ""}/>` : ""
  const [t, r, bt, l] = sides
  const strip = (s: typeof t, x: number, y: number, w: number, h: number) => (s.w > 0 && paint(s.c) ? `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${fillAttr(s.c)}/>` : "")
  out += strip(t, b.x, b.y, b.w, t.w) + strip(bt, b.x, b.y + b.h - bt.w, b.w, bt.w) + strip(l, b.x, b.y, l.w, b.h) + strip(r, b.x + b.w - r.w, b.y, r.w, b.h)
  return out
}

/** The nearest element that clips this text (overflow hidden): its box in screen pixels, and whether it ends a cut line
 *  with an ellipsis (truncate, line-clamp). */
function clipOf(el: Element, root: Element): { r: DOMRect; ellipsis: boolean } | null {
  for (let e: Element | null = el; e && e !== root.parentElement; e = e.parentElement) {
    const cs = getComputedStyle(e)
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue
    const clamp = cs.getPropertyValue("-webkit-line-clamp")
    return { r: e.getBoundingClientRect(), ellipsis: cs.textOverflow === "ellipsis" || (!!clamp && clamp !== "none") }
  }
  return null
}

/** Which end of its box a line keeps when another font is wider: the nearest container with room tells. */
function anchorOf(el: Element, root: Element, left: number, right: number): "start" | "middle" | "end" {
  for (let e: Element | null = el; e && e !== root.parentElement; e = e.parentElement) {
    const cs = getComputedStyle(e)
    if (cs.display === "inline") continue
    const r = e.getBoundingClientRect()
    const l = left - (r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft))
    const rt = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) - right
    if (l < 1 && rt < 1) continue
    if (Math.abs(l - rt) < 1.5) return "middle"
    return rt < 1 ? "end" : "start"
  }
  return "start"
}

/** A text node as one SVG <text> per laid-out line, cut where its box clips it (with an ellipsis where the page shows one). */
function textOf(node: Text, el: HTMLElement, root: Element, m: Mapper): string {
  const s = node.data
  if (!s.trim()) return ""
  const cs = getComputedStyle(el)
  const ink = paint(cs.color)
  if (!ink) return ""
  const range = document.createRange()
  const words: { i: number; j: number; r: DOMRect }[] = []
  for (const w of s.matchAll(/\S+/g)) {
    const i = w.index ?? 0
    range.setStart(node, i)
    range.setEnd(node, i + w[0].length)
    const r = range.getClientRects()[0]
    if (r && r.width > 0) words.push({ i, j: i + w[0].length, r })
  }
  if (!words.length) return ""
  const lines: (typeof words)[] = []
  for (const w of words) {
    const last = lines[lines.length - 1]
    if (last && w.r.top < last[0].r.top + last[0].r.height / 2) last.push(w)
    else lines.push([w])
  }
  const clipped = clipOf(el, root)
  const clip = clipped?.r
  const ellipsis = !!clipped?.ellipsis
  const visible = clip ? lines.filter((l) => l[0].r.top < clip.bottom - 1 && l[0].r.bottom > clip.top + 1) : lines
  const size = parseFloat(cs.fontSize)
  const font = fontOf(cs)
  const { asc, desc } = metrics(font, size)
  const pre = cs.whiteSpace.startsWith("pre") || cs.whiteSpace === "break-spaces"
  const spacing = cs.letterSpacing !== "normal" && parseFloat(cs.letterSpacing) ? ` letter-spacing="${num(parseFloat(cs.letterSpacing))}"` : ""
  const attrs = `font-family="${family(cs.fontFamily)}" font-size="${num(size)}"${cs.fontWeight !== "400" ? ` font-weight="${cs.fontWeight}"` : ""}${cs.fontStyle !== "normal" ? ` font-style="${cs.fontStyle}"` : ""}${spacing} fill="${ink.c}"${ink.a < 1 ? ` fill-opacity="${num(ink.a)}"` : ""}`
  let out = ""
  visible.forEach((line, li) => {
    const kept = clip ? line.filter((w) => w.r.right <= clip.right + 0.5) : line
    let end = kept.length ? kept[kept.length - 1].j : line[0].i
    let cut = kept.length < line.length || (li === visible.length - 1 && visible.length < lines.length)
    if (clip && kept.length < line.length) {
      // the browser cuts inside the word that crosses the edge: find the last character that fits before the ellipsis
      const w = line[kept.length]
      ctx().font = font
      const room = clip.right - (ellipsis ? ctx().measureText("…").width * m.k : 0)
      let k = w.i
      for (let c = w.i + 1; c <= w.j; c++) {
        range.setStart(node, w.i)
        range.setEnd(node, c)
        if (range.getBoundingClientRect().right > room) break
        k = c
      }
      if (k > w.i) end = k
      if (!kept.length && k === w.i) return
    }
    if (!ellipsis) cut = false
    const first = kept[0] ?? line[0]
    let t = s.slice(first.i, end)
    if (!pre) t = t.replace(/\s+/g, " ")
    if (cut) t = `${t.trimEnd()}…`
    const right = (kept[kept.length - 1] ?? first).r.right
    const b = m.box(first.r)
    const r = b.x + (right - first.r.left) / m.k
    const baseline = b.y + (b.h - (asc + desc)) / 2 + asc
    const anchor = cut ? "start" : anchorOf(el, root, first.r.left, right)
    const x = anchor === "start" ? b.x : anchor === "end" ? r : (b.x + r) / 2
    out += `<text x="${num(x)}" y="${num(baseline)}"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""} ${attrs}>${esc(t)}</text>`
  })
  return out
}

/** The SVG presentation properties copied from computed style, so strokes set by stylesheets survive. */
const SVG_PROPS = ["stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "fill", "opacity", "font-size", "font-family", "font-weight", "font-style"] as const

/** An SVG element (an arrow, an icon, the N-Z axes) with its computed strokes and fills written on as attributes. */
function svgCopy(src: SVGElement): SVGElement {
  const dst = src.cloneNode(true) as SVGElement
  const walk = (a: Element, b: Element) => {
    if (a.matches(".react-flow__edge-interaction")) { b.remove(); return }
    const cs = getComputedStyle(a)
    const isText = a.tagName === "text" || a.tagName === "tspan"
    for (const p of SVG_PROPS) {
      const v = cs.getPropertyValue(p)
      if (!v || (p.startsWith("font") && !isText)) continue
      if ((p === "stroke-linecap" && v === "butt") || (p === "stroke-linejoin" && v === "miter")) continue
      if (p === "stroke-width" && cs.getPropertyValue("stroke") === "none") continue
      if (p === "stroke" || p === "fill") {
        const c = paint(v)
        b.setAttribute(p, c ? c.c : "none")
        if (c && c.a < 1) b.setAttribute(`${p}-opacity`, num(c.a))
      } else if (p === "font-family") b.setAttribute(p, family(v))
      else if (p === "opacity") { if (parseFloat(v) < 1) b.setAttribute(p, v) }
      else if (p === "stroke-dasharray") { if (v !== "none") b.setAttribute(p, v.replace(/px/g, "")) }
      else b.setAttribute(p, v.replace(/px$/, ""))
    }
    for (const n of [...b.getAttributeNames()]) if (/^(class|style|tabindex|role|focusable|pointer-events|aria-.*|data-.*)$/.test(n)) b.removeAttribute(n)
    const ac = [...a.children], bc = [...b.children]
    for (let i = ac.length - 1; i >= 0; i--) walk(ac[i], bc[i])
  }
  walk(src, dst)
  return dst
}

/** An HTML element and its children as SVG: its box, its text lines, its nested SVG, in paint order. */
function htmlOf(el: Element, root: Element, m: Mapper, top: boolean): string {
  if (el instanceof SVGSVGElement) {
    const b = m.box(el.getBoundingClientRect())
    if (!b.w || !b.h) return ""
    const copy = svgCopy(el)
    copy.setAttribute("x", num(b.x))
    copy.setAttribute("y", num(b.y))
    copy.setAttribute("width", num(b.w))
    copy.setAttribute("height", num(b.h))
    if (getComputedStyle(el).overflow === "visible") copy.setAttribute("overflow", "visible")
    return new XMLSerializer().serializeToString(copy).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "")
  }
  if (!(el instanceof HTMLElement) || el.matches(SKIP)) return ""
  // a card's buttons are its controls; a node that is itself a button (the "+N more" card) stays
  if (el.tagName === "BUTTON" && !top && !el.parentElement?.classList.contains("react-flow__node")) return ""
  const cs = getComputedStyle(el)
  if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return ""
  let out = boxOf(cs, m.box(el.getBoundingClientRect()))
  for (const c of el.childNodes) {
    if (c.nodeType === Node.TEXT_NODE) out += textOf(c as Text, el, root, m)
    else if (c.nodeType === Node.ELEMENT_NODE) out += htmlOf(c as Element, root, m, false)
  }
  if ((el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && el.value) {
    const b = m.box(el.getBoundingClientRect())
    const size = parseFloat(cs.fontSize)
    out += `<text x="${num(b.x + parseFloat(cs.paddingLeft))}" y="${num(b.y + parseFloat(cs.paddingTop) + size)}" font-family="${family(cs.fontFamily)}" font-size="${num(size)}" ${fillAttr(cs.color)}>${esc(el.value.split("\n")[0].slice(0, 80))}</text>`
  }
  const op = parseFloat(cs.opacity)
  return op < 1 && out ? `<g opacity="${num(op)}">${out}</g>` : out
}

/** The canvas inside `flow` (the .react-flow element) as an SVG document titled `title`. */
export function canvasToSvg(flow: HTMLElement, title: string): string {
  const m = mapper(flow)
  const boxes: Box[] = []
  const z = (el: Element) => parseInt(getComputedStyle(el).zIndex) || 0

  const nodes = [...flow.querySelectorAll<HTMLElement>(".react-flow__nodes > .react-flow__node")]
    .filter((n) => getComputedStyle(n).visibility !== "hidden" && getComputedStyle(n).display !== "none")
    .map((n, i) => ({ n, i, z: z(n) }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
  const drawNode = ({ n }: { n: HTMLElement }) => {
    boxes.push(m.box(n.getBoundingClientRect()))
    return htmlOf(n, n, m, true)
  }

  let edges = ""
  const defs = flow.querySelector(".react-flow__edges .react-flow__marker defs")
  if (defs?.children.length) edges += new XMLSerializer().serializeToString(svgCopy(defs as SVGElement)).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "")
  for (const svg of [...flow.querySelectorAll<SVGSVGElement>(".react-flow__edges > svg:not(.react-flow__marker)")].sort((a, b) => z(a) - z(b))) {
    for (const g of svg.querySelectorAll<SVGGElement>(":scope > g.react-flow__edge")) {
      if (getComputedStyle(g).display === "none" || getComputedStyle(g).visibility === "hidden") continue
      const path = g.querySelector<SVGGraphicsElement>(".react-flow__edge-path")
      if (path) { const bb = path.getBBox(); boxes.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height }) }
      edges += new XMLSerializer().serializeToString(svgCopy(g)).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "")
    }
  }

  const labels = [...(flow.querySelector(".react-flow__edgelabel-renderer")?.children ?? [])].map((l) => {
    boxes.push(m.box(l.getBoundingClientRect()))
    return htmlOf(l, l, m, true)
  }).join("")

  const behind = nodes.filter((x) => x.z < 0).map(drawNode).join("")
  const front = nodes.filter((x) => x.z >= 0).map(drawNode).join("")

  const real = boxes.filter((b) => b.w > 0 || b.h > 0)
  const pad = 32
  const x0 = (real.length ? Math.min(...real.map((b) => b.x)) : 0) - pad
  const y0 = (real.length ? Math.min(...real.map((b) => b.y)) : 0) - pad
  const x1 = (real.length ? Math.max(...real.map((b) => b.x + b.w)) : 400) + pad
  const y1 = (real.length ? Math.max(...real.map((b) => b.y + b.h)) : 300) + pad
  const w = x1 - x0, h = y1 - y0
  const paper = getComputedStyle(flow).getPropertyValue("--paper").trim() || "#ffffff"
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${num(w)}" height="${num(h)}" viewBox="${num(x0)} ${num(y0)} ${num(w)} ${num(h)}">`,
    `<title>${esc(title)}</title>`,
    `<rect x="${num(x0)}" y="${num(y0)}" width="${num(w)}" height="${num(h)}" ${fillAttr(paper)}/>`,
    behind, edges, labels, front,
    `</svg>`,
  ].join("\n")
}

/** The title as a file name: the characters file systems refuse become dashes. */
export const svgFileName = (title: string) => `${title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "canvas"}.svg`

/** Downloads the SVG as `name`. */
export function downloadSvg(svg: string, name: string): void {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
