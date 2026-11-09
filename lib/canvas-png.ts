// The /graph canvas as a PNG (Brendan, 2026-11-08: the bottom-right Copy). No library: the canvas is cloned with every
// element's computed style written inline, wrapped in an SVG foreignObject, drawn onto a <canvas> and read back as PNG,
// the way html-to-image works. React Flow's panels (the search bar, the tools, the zoom controls) are left out.

const SKIP = ".react-flow__panel, .react-flow__controls, .react-flow__minimap, [data-canvas-skip]"

/** Writes each source element's computed style onto its clone, recursively, so the clone renders alone. */
function inline(src: Element, dst: Element) {
  const cs = getComputedStyle(src)
  let css = ""
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i]
    css += `${p}:${cs.getPropertyValue(p)};`
  }
  ;(dst as HTMLElement).setAttribute("style", css)
  const a = src.children
  const b = dst.children
  for (let i = 0; i < a.length && i < b.length; i++) inline(a[i], b[i])
}

/** The element as a PNG, at twice its size on screen, on `background`. */
export async function elementToPng(el: HTMLElement, background: string): Promise<Blob> {
  const { width, height } = el.getBoundingClientRect()
  const clone = el.cloneNode(true) as HTMLElement
  inline(el, clone)
  clone.querySelectorAll(SKIP).forEach((n) => n.remove())
  clone.style.margin = "0"
  const xhtml = new XMLSerializer().serializeToString(clone)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const scale = 2
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no canvas")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"))
}

/** Copies text where the page can (the clipboard needs https); else the older selection copy, which works on http too. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  const t = document.createElement("textarea")
  t.value = text
  t.style.position = "fixed"
  t.style.opacity = "0"
  document.body.appendChild(t)
  t.select()
  const ok = document.execCommand("copy")
  t.remove()
  if (!ok) throw new Error("copy failed")
}

/** The PNG onto the clipboard where the browser allows images there (https); else it downloads as `name`. Says which. */
export async function copyPng(blob: Blob, name: string): Promise<"copied" | "downloaded"> {
  if (window.isSecureContext && navigator.clipboard && "ClipboardItem" in window) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
    return "copied"
  }
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return "downloaded"
}
