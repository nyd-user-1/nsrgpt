// What shots.mjs, guides.mjs and record.mjs share (2026-11-07): the dev server, the browser, dark mode and the dev
// chrome kept out of the pictures, and the pointer helpers for charts.

export const BASE = "http://localhost:3000"

// The codespace has no GPU: WebGL (the 3D charts) runs on SwiftShader, which Chrome only allows when asked.
// Full Chromium in its new headless mode: the headless shell timed out photographing the busiest WebGL pages.
// WEBGPU=1 adds WebGPU on SwiftShader's Vulkan, for the one page that needs it (/viz/particles).
const WEBGPU = process.env.WEBGPU ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-vulkan=swiftshader", "--use-webgpu-adapter=swiftshader"] : []
export const LAUNCH = { channel: "chromium", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", ...WEBGPU] }

/** LIGHT=1: the app's default light theme, PAX Light (DEFAULT_THEME in lib/theme.ts), and pictures named <name>.light. */
export const LIGHT = !!process.env.LIGHT
export const SUFFIX = LIGHT ? ".light" : ""
export const SCHEME = LIGHT ? "light" : "dark"

/** Dark mode as the user panel's switch sets it (next-themes' "theme", lib/theme-reveal.ts), or PAX Light with LIGHT=1,
 *  before the first paint; Next's dev badge and the dev inspector stay out of the pictures. */
export async function prepare(ctx) {
  await ctx.addInitScript((light) => {
    localStorage.setItem("theme", light ? "light" : "dark")
    if (light) localStorage.setItem("pax:theme", "pax-light")
    // In every frame, the second panel's too, and again once the page has loaded, in case hydration dropped it.
    const hide = () => {
      if (document.getElementById("docs-capture-hide")) return
      const st = document.createElement("style")
      st.id = "docs-capture-hide"
      st.textContent = "nextjs-portal,[data-devinspector]{display:none!important}"
      ;(document.head ?? document.documentElement).appendChild(st)
    }
    document.addEventListener("DOMContentLoaded", hide)
    window.addEventListener("load", hide)
    setInterval(hide, 1000)
  }, LIGHT)
}

/** The chart frame's box (components/viz/FramedBox.tsx). */
export async function frameBox(page) {
  return page.locator("[data-viz-frame]").first().boundingBox()
}

/** The pointer parked in the app frame's right margin, where it hovers nothing. */
export async function quietBox(page) {
  await page.mouse.move(1432, 450)
  await page.waitForTimeout(300)
}

// ECharts' own tooltip (z-index 9999999), shown and holding text.
const tipShown = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("div")].some((d) => {
      if (d.style.zIndex !== "9999999") return false
      const s = getComputedStyle(d)
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.5 && d.innerText.trim().length > 0
    }),
  )

/** The pointer moved down columns of the chart until a point answers with its tooltip; returns where, or null. */
export async function hoverPoint(page, columns = [0.3, 0.45, 0.6, 0.2, 0.75]) {
  const f = await frameBox(page)
  if (!f) return null
  for (const fx of columns) {
    const x = Math.round(f.x + f.width * fx)
    for (let y = f.y + 30; y < f.y + f.height - 70; y += 5) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(40)
      if (await tipShown(page)) {
        await page.waitForTimeout(500)
        if (await tipShown(page)) return { x, y }
      }
    }
  }
  return null
}

/** The visible tooltip's box, CSS px. */
export async function tipBox(page) {
  return page.evaluate(() => {
    const d = [...document.querySelectorAll("div")].find((d) => d.style.zIndex === "9999999" && getComputedStyle(d).display !== "none" && Number(getComputedStyle(d).opacity) > 0.5)
    if (!d) return null
    const r = d.getBoundingClientRect()
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
  })
}

/** A click on the main header's empty middle, which opens the Nav (components/AppLayout.tsx); returns the spot. */
export async function headerGap(page, click = true) {
  const h = await page.locator("[data-main-header]").first().boundingBox()
  const at = { x: Math.round(h.x + h.width / 2), y: Math.round(h.y + h.height / 2) }
  if (click) await page.mouse.click(at.x, at.y)
  return at
}

/** Waits until the second panel's page has drawn its chart (or its table), then a moment more. */
export async function paneReady(page) {
  await page.frameLocator("iframe").first().locator("[data-viz-frame] canvas, tbody tr").first().waitFor({ timeout: 90000 }).catch(() => console.log("  the second panel never drew"))
  await page.waitForTimeout(4000)
}

/** A press and a short drag inside a 3D chart: the frame takes the arrows (and the camera turns a little) without a
 *  click, which would open the chart's data in the second panel. */
export async function engage(page) {
  const f = await frameBox(page)
  const x = f.x + f.width * 0.5, y = f.y + f.height * 0.5
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y + 6, { steps: 8 })
  await page.mouse.up()
  return { x, y }
}
