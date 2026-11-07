// Screen recordings for the docs: real sessions recorded by Playwright, with a timestamp at each beat, for the
// Remotion edit (scripts/docs-media Recording) to cut, speed and caption. pax-trinity's
// scripts/docs-media/capture/record.mjs, adapted to NSRgpt (2026-11-07).
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { chromium } from "../node_modules/playwright-core/index.mjs"
import { BASE, LAUNCH, prepare, quietBox } from "./common.mjs"

const DIR = new URL("./rec/", import.meta.url).pathname
mkdirSync(DIR, { recursive: true })
const which = process.argv[2]

const browser = await chromium.launch(LAUNCH)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", recordVideo: { dir: DIR, size: { width: 1440, height: 900 } } })
await prepare(ctx)
const page = await ctx.newPage()
const t0 = Date.now()
const beats = []
const beat = (name) => (beats.push({ name, t: (Date.now() - t0) / 1000 }), console.log(name, ((Date.now() - t0) / 1000).toFixed(1)))
const pause = (ms) => page.waitForTimeout(ms)
async function go(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 }).catch(() => {})
  await page.waitForSelector("[data-viz-frame]", { timeout: 120000 }).catch(() => {})
  await quietBox(page)
}
// The right panel, Viz › the chart: its controls and legend.
async function controls(name) {
  await page.click('button[aria-label="Open the switchboard"]')
  await pause(600)
  await page.getByRole("button", { name: "Viz", exact: true }).click()
  await pause(600)
  await page.getByRole("button", { name, exact: true }).click()
  await pause(800)
  await quietBox(page)
}

if (which === "decay") {
  await go("/viz/decay")
  await pause(6000)
  beat("open")
  await pause(10000)
  beat("running")
  await controls("Radioactive Decay Simulation")
  beat("controls")
  await pause(3000)
  await page.click('button[aria-label="Pause"]')
  beat("paused")
  await pause(3000)
  await page.click('button[aria-label="Play"]')
  beat("played")
  await pause(5000)
  await page.click('button[aria-label="Reset"]')
  beat("reset")
  await pause(6000)
  beat("end")
} else if (which === "levels") {
  await go("/viz/levels")
  await pause(10000)
  beat("open")
  await pause(9000)
  beat("turned")
  // The nuclide field is in the right panel, with the chart's other controls.
  await controls("Adopted Level Energies")
  beat("controls")
  await pause(1500)
  const goTo = page.locator('input[aria-label="Go to a nuclide"]')
  await goTo.click()
  await goTo.pressSequentially("120Sn", { delay: 120 })
  await page.keyboard.press("Enter")
  beat("sent")
  await pause(7000)
  beat("flown")
  await goTo.click()
  await goTo.fill("")
  await goTo.pressSequentially("56Fe", { delay: 120 })
  await page.keyboard.press("Enter")
  beat("sent-2")
  await pause(7000)
  beat("end")
} else if (which === "reactions") {
  await go("/viz/reactions")
  await pause(6000)
  beat("open")
  await pause(8000)
  beat("lines")
  await controls("Nuclide Decay Paths")
  beat("controls")
  await pause(1500)
  await page.getByRole("button", { name: "Thorium series", exact: true }).click()
  beat("thorium")
  await pause(8000)
  await page.getByRole("button", { name: "Neptunium series", exact: true }).click()
  beat("neptunium")
  await pause(8000)
  beat("end")
}

const path = await page.video().path()
await ctx.close()
await browser.close()
renameSync(path, `${DIR}${which}.webm`)
writeFileSync(`${DIR}${which}.json`, JSON.stringify(beats, null, 1))
console.log("saved", `${DIR}${which}.webm`)
