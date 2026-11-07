// Docs screenshots: the key states and every chart page, dark mode, 1440x900 at 2x, JPEG. pax-trinity's
// scripts/docs-media/capture/shots.mjs, adapted to NSRgpt (2026-11-07).
import { readFileSync } from "node:fs"
import { chromium } from "../node_modules/playwright-core/index.mjs"
import { BASE, LAUNCH, prepare, hoverPoint, frameBox, quietBox, headerGap, paneReady, engage, SUFFIX, SCHEME } from "./common.mjs"

const OUT = new URL("./shots/", import.meta.url).pathname
const only = process.argv[2]?.split(",")

const browser = await chromium.launch(LAUNCH)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: SCHEME })
await prepare(ctx)
const page = await ctx.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(e.message))

const settle = (ms = 900) => page.waitForTimeout(ms)
async function go(path, wait, ms = 1500) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 }).catch(() => {})
  if (wait) await page.waitForSelector(wait, { timeout: 120000 }).catch(() => {})
  await settle(ms)
}
// A chart page: its frame, then long enough for its data and first draw (a 3D chart's scene takes longest).
const chart = async (href) => go(href, "[data-viz-frame]", 6000)
const sidebar = async () => (await page.locator('[data-main-header] button[aria-label="Toggle sidebar"]').click(), settle(900))
const switchType = '[data-viz-frame] button[aria-label$=": switch chart type"]'

// Every chart page, from the app's own list (lib/viz-charts.ts): /viz/nebula → chart-nebula.
const CHARTS = [...readFileSync(new URL("../../../lib/viz-charts.ts", import.meta.url), "utf8").matchAll(/href: "(\/viz\/[^"]+)"/g)].map((m) => m[1])

const SHOTS = {
  "home": async () => go("/"),
  "sidebar": async () => (await go("/"), sidebar()),
  "search": async () => (await go("/"), await page.keyboard.press("Control+k"), await page.waitForSelector('[role="dialog"][aria-label="Search"]', { timeout: 30000 }), settle(800)),
  // A click on the header's empty space opens the Nav (components/AppLayout.tsx).
  "nav": async () => (await go("/"), await headerGap(page), await page.waitForSelector('[role="dialog"][aria-label="Nav"]', { timeout: 30000 }), settle(700)),
  "panel-2": async () => (await go("/"), await page.locator('a[href="/viz/nebula"] [aria-label$="in the second panel"]').click(), await paneReady(page), quietBox(page)),
  // A drawn note: Shift and a drag across the chart, then a line written in it.
  "notes": async () => {
    await chart("/viz/nebula")
    await page.keyboard.down("Shift")
    await page.mouse.move(860, 260)
    await page.mouse.down()
    await page.mouse.move(1260, 560, { steps: 14 })
    await page.mouse.up()
    await page.keyboard.up("Shift")
    await settle(2500)
    const editor = page.locator('[role="dialog"] [contenteditable="true"]').first()
    await editor.click().catch(() => {})
    await page.keyboard.type("The top of the curve is Ni-62, not Fe-56.", { delay: 20 })
    await settle(900)
  },
  // The right panel, Viz › the chart: its controls and legend.
  "switchboard": async () => {
    await chart("/viz/reactions")
    await page.click('button[aria-label="Open the switchboard"]')
    await settle(700)
    await page.getByRole("button", { name: "Viz", exact: true }).click()
    await settle(700)
    await page.getByRole("button", { name: "Nuclide Decay Paths", exact: true }).click()
    await settle(2500)
    await quietBox(page)
  },
  "chart-type": async () => (await chart("/viz/nebula"), await page.click(switchType), settle(800)),
  "tooltip": async () => {
    await chart("/viz/nebula")
    if (!(await hoverPoint(page))) console.log("WARN tooltip: no point answered the pointer")
    await settle(600)
  },
  // A 3D chart pressed: the frame takes the arrows and lists the camera's keys.
  "engaged": async () => {
    await chart("/viz/scatter3d")
    await engage(page)
    await quietBox(page)
    await settle(1500)
  },
  "data-table": async () => go("/viz/data/nebula", "tbody tr", 2000),
}
for (const href of CHARTS) SHOTS[`chart-${href.slice("/viz/".length)}`] = async () => (await chart(href), await quietBox(page))

for (const [name, run] of Object.entries(SHOTS)) {
  if (only && !only.includes(name)) continue
  const t = Date.now()
  try {
    await run()
    // Chrome's own error page (the server dropped the connection mid-compile) is no picture: keep the last good one.
    if (page.url().startsWith("chrome-error:")) {
      console.log("ERR", name, "no page: the server dropped the connection")
      continue
    }
    const check = await page.evaluate(() => ({ text: document.body.innerText.length, overlay: !!document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-nextjs-dialog], [data-nextjs-error-overlay-nav]") }))
    if (check.overlay || check.text < 40) console.log("WARN", name, JSON.stringify(check))
    await page.screenshot({ path: `${OUT}${name}${SUFFIX}.jpg`, type: "jpeg", quality: 78, timeout: 120000 })
    console.log("ok ", name, `${((Date.now() - t) / 1000).toFixed(1)}s`)
  } catch (e) {
    console.log("ERR", name, e.message.split("\n")[0])
  }
  // Each shot starts from a clean page: no note, panel or menu left over from the last.
  await page.evaluate(() => localStorage.clear()).catch(() => {})
}
console.log("page errors:", errors.length ? [...new Set(errors)].slice(0, 5) : "none")
await browser.close()
