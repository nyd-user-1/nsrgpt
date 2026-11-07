// Docs guide capture: walks each guide, photographing every step and recording the box of the element the step
// points at (CSS px in the 1440x900 viewport), for the Remotion guide composition. Writes guides/<id>/NN.jpg and
// guides/<id>.json. pax-trinity's scripts/docs-media/capture/guides.mjs, adapted to NSRgpt (2026-11-07).
import { mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "../node_modules/playwright-core/index.mjs"
import { BASE, LAUNCH, prepare, hoverPoint, frameBox, tipBox, quietBox, headerGap, paneReady, engage } from "./common.mjs"

const ROOT = new URL("./guides/", import.meta.url).pathname
const only = process.argv[2]?.split(",")

const browser = await chromium.launch(LAUNCH)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" })
await prepare(ctx)
const page = await ctx.newPage()
const pause = (ms) => page.waitForTimeout(ms)

async function go(path, wait, ms = 1500) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 }).catch(() => {})
  if (wait) await page.waitForSelector(wait, { timeout: 120000 }).catch(() => {})
  await pause(ms)
}
const chart = async (href) => go(href, "[data-viz-frame]", 6000)
const boxOf = async (loc) => {
  const b = await loc.boundingBox()
  return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null
}
/** A box for a step that points at a spot rather than an element: the pointer's place, or a stretch of the page. */
const spot = (x, y, w = 28, h = 28) => ({ box: [Math.round(x - w / 2), Math.round(y - h / 2), w, h] })
const toggle = () => page.locator('[data-main-header] button[aria-label="Toggle sidebar"]')
const group = (name) => page.locator("nav button[aria-expanded]").filter({ hasText: name })

/** A guide: steps of { caption, target (a locator, a spot, or null for the whole screen), click?, wait? }. */
function guide(id, title, subtitle, build) {
  return { id, title, subtitle, build }
}

const GUIDES = [
  guide("find-your-way", "Find your way", "The sidebar, search and the Nav", async (step) => {
    await go("/")
    await step("The button at the top left opens the sidebar.", toggle(), { click: true, wait: 900 })
    await step("Search sits at the top. It finds every chart, table and chat.", page.getByRole("button", { name: /Quick search/ }))
    await step("Below it: Chat, Charts and Data.", page.locator("nav").first())
    await step("Charts opens into every chart page.", group("Charts"), { click: true, wait: 700 })
    await step("Each page hangs off the branch. Click one to open it.", page.locator("nav > div.flex.flex-col").first())
    await group("Charts").click()
    await pause(500)
    const gap = await headerGap(page, false)
    await step("A click on the header's empty space opens the Nav.", spot(gap.x, gap.y, 220, 60), { at: [gap.x, gap.y], wait: 900 })
    await step("The Nav lists every page. Arrows move, Enter opens.", page.locator('[role="dialog"][aria-label="Nav"]'))
  }),
  guide("read-a-chart", "Read a chart", "Open one, read a point, change its type", async (step) => {
    await go("/")
    await step("Each box on the front page is a chart. Click one to open it.", page.locator('a[data-nav="plate"][href="/viz/nebula"]'), { click: true, wait: 1500 })
    // The box grows into its chart, then the page changes (expand-box.tsx).
    // In the codespace's headless Chromium the press never moved the page (2026-11-07): the chart is then loaded directly.
    const moved = await page.waitForURL("**/viz/nebula", { timeout: 15000 }).then(() => true, () => false)
    if (!moved) {
      console.log("  the box didn't open its chart; loading /viz/nebula")
      await page.goto(BASE + "/viz/nebula", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {})
    }
    await page.waitForSelector("[data-viz-frame] canvas", { timeout: 120000 }).catch(() => console.log("  no chart frame"))
    await pause(5000)
    await quietBox(page)
    await step("The chart fills the page.", page.locator("[data-viz-frame]"))
    const at = await hoverPoint(page)
    if (!at) console.log("  no point answered the pointer")
    await step("Hover a point to read it.", at ? spot(at.x, at.y) : null)
    const tip = await tipBox(page)
    await step("The tooltip names the nuclide and gives its value.", tip ? { box: tip } : null)
    await step("The chart type at the foot is a switcher.", page.locator('[data-viz-frame] button[aria-label$=": switch chart type"]'), { click: true, wait: 800 })
    await step("Every type that fits the same data is listed.", page.getByRole("menu").first())
  }),
  guide("3d-camera", "Move the 3D camera", "Click in, steer with the keys, Esc out", async (step) => {
    await chart("/viz/scatter3d")
    await quietBox(page)
    await step("A 3D chart turns slowly on its own.", page.locator("[data-viz-frame]"))
    const f = await frameBox(page)
    const mid = { x: f.x + f.width * 0.5, y: f.y + f.height * 0.5 }
    await step("Click inside it to take the camera.", spot(mid.x, mid.y), { press: true, wait: 1200 })
    await step("The camera's keys show at the foot.", page.locator("[data-viz-frame] p[data-frame-nav]"))
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft")
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp")
    await pause(1200)
    await step("The arrows orbit and tilt. Shift and the arrows pan.", page.locator("[data-viz-frame]"))
    for (let i = 0; i < 3; i++) await page.keyboard.press("=")
    await pause(1200)
    await step("Plus and minus zoom. 0 resets the view.", page.locator("[data-viz-frame]"))
    await page.keyboard.press("Escape")
    await pause(800)
    await step("Esc hands the arrows back to the page.", null)
  }),
  guide("panel-2", "Open a second panel", "Two pages side by side", async (step) => {
    await go("/")
    await step("Open the sidebar.", toggle(), { click: true, wait: 900 })
    await step("Charts opens into every chart page.", group("Charts"), { click: true, wait: 700 })
    const row = page.locator('nav a[href="/viz/separation"]').first()
    await row.hover()
    await pause(500)
    await step("Hover a row and press its arrow.", page.locator('button[aria-label="Open Neutron Separation Energies in Panel 2"]'), { click: true, ready: true })
    await step("The page opens in the second panel, beside this one.", page.locator("iframe").first())
    await toggle().click()
    await pause(1200)
    await step("On the front page, each box has a panel button too.", page.locator('a[href="/viz/heatmap"] [aria-label$="in the second panel"]'), { click: true, ready: true })
    await step("The second panel moves to that chart.", page.locator("iframe").first())
  }),
  guide("search", "Search", "Every chart, table, chat and page from one box", async (step) => {
    await go("/")
    await page.keyboard.press("Control+k")
    await page.waitForSelector('[role="dialog"][aria-label="Search"]', { timeout: 30000 })
    await pause(700)
    await step("⌘K opens search from any page.", page.locator('[role="dialog"][aria-label="Search"]'))
    await page.keyboard.type("decay", { delay: 60 })
    await pause(800)
    await step("Type a few letters. The results rank as you type.", page.locator('[role="dialog"][aria-label="Search"] input'))
    await step("A scope chip narrows the results to one kind.", page.locator('[role="dialog"][aria-label="Search"] button', { hasText: /^Charts$/ }), { click: true, wait: 800 })
    await step("Enter opens the selected result.", page.locator('[role="dialog"][aria-label="Search"] [data-idx="0"]'), { wait: 7000, key: "Enter" })
    await quietBox(page)
    await step("The chart opens.", null)
  }),
  guide("data-table", "Use a chart's table", "Step through the rows and select a run", async (step) => {
    await go("/viz/data/nebula", "tbody tr", 2500)
    await step("Every chart's data has a table of its own.", page.locator("table").first())
    await step("Click a row to select it.", page.locator("tbody tr").nth(2), { click: true, wait: 700 })
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown")
    await pause(600)
    await step("The arrow keys step from row to row.", page.locator('tbody tr[aria-selected="true"]').last())
    for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowDown")
    await pause(600)
    const picked = page.locator('tbody tr[aria-selected="true"]')
    const a = await boxOf(picked.first())
    const b = await boxOf(picked.last())
    await step("Shift and the arrows select a run of rows.", a && b ? { box: [a[0], a[1], a[2], b[1] + b[3] - a[1]] } : null)
    await step("The arrows at the top page through the rest.", page.locator('button[aria-label="Next page"]'))
  }),
  guide("notes", "Write a note", "Shift and a drag, on any page", async (step) => {
    await chart("/viz/nebula")
    await quietBox(page)
    await page.keyboard.down("Shift")
    await page.mouse.move(860, 260)
    await page.mouse.down()
    await page.mouse.move(1260, 560, { steps: 14 })
    await step("Hold Shift and drag across the page.", spot(1060, 410, 400, 300))
    await page.mouse.up()
    await page.keyboard.up("Shift")
    await pause(2500)
    const note = page.locator('[role="dialog"]').filter({ has: page.locator('[aria-label="Resize"]') }).first()
    await step("A note opens in the box you drew.", note)
    await note.locator('[contenteditable="true"]').first().click().catch(() => {})
    await page.keyboard.type("The top of the curve is Ni-62, not Fe-56.", { delay: 30 })
    await pause(800)
    await step("Write in it.", note.locator('[contenteditable="true"]').first())
    await step("Drag the grip to move it, the corner to resize it.", note.locator('[aria-label="Resize"]'))
  }),
]

for (const g of GUIDES) {
  if (only && !only.includes(g.id)) continue
  const dir = `${ROOT}${g.id}/`
  mkdirSync(dir, { recursive: true })
  const steps = []
  // target: a locator, { box } for a spot, or null. opt.at clicks a point; opt.key presses a key after the shot.
  const step = async (caption, target, opt = {}) => {
    const n = String(steps.length + 1).padStart(2, "0")
    let focus = null
    const isLoc = target && !target.box
    if (target?.box) focus = target.box
    else if (target) {
      await target.scrollIntoViewIfNeeded().catch(() => {})
      focus = await boxOf(target).catch(() => null)
    }
    await page.screenshot({ path: `${dir}${n}.jpg`, type: "jpeg", quality: 80, timeout: 120000 })
    const click = !!opt.click || !!opt.at || !!opt.press
    steps.push({ img: `guides/${g.id}/${n}.jpg`, caption, focus, click })
    if (opt.click && isLoc) await target.click().catch((e) => console.log("  click failed:", caption.slice(0, 40), e.message.split("\n")[0]))
    if (opt.at) await page.mouse.click(opt.at[0], opt.at[1])
    if (opt.press) (await engage(page), await quietBox(page))
    if (opt.ready) await paneReady(page)
    if (opt.key) await page.keyboard.press(opt.key)
    if (opt.wait) await pause(opt.wait)
  }
  try {
    await g.build(step)
    writeFileSync(`${ROOT}${g.id}.json`, JSON.stringify({ title: g.title, subtitle: g.subtitle, steps }, null, 1))
    console.log("ok ", g.id, steps.length, "steps;", steps.filter((s) => s.focus === null).length, "without focus")
  } catch (e) {
    console.log("ERR", g.id, e.message.split("\n")[0])
  }
  await page.evaluate(() => localStorage.clear()).catch(() => {})
}
await browser.close()
