// Dev box: load Elpis pages in Chromium (Playwright at /opt/shot), write screenshots to public/viz-data/shots/ and print
// the console errors, page errors and failed requests, so a change is checked by looking at the page.
//   node scripts/devbox/shot-elpis.cjs <name> <path> [<path>...]   (run on the dev box, /srv/nsrgpt)
const { chromium } = require("/opt/shot/node_modules/playwright")

;(async () => {
  const [name, ...paths] = process.argv.slice(2)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const logs = []
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on("requestfailed", (r) => logs.push(`failed: ${r.url().slice(0, 200)} ${r.failure()?.errorText}`))
  page.on("response", (r) => { if (r.status() >= 400) logs.push(`${r.status()}: ${r.url().slice(0, 200)}`) })
  let i = 0
  for (const p of paths) {
    await page.goto(`http://localhost:3000${p}`, { waitUntil: "domcontentloaded", timeout: 300000 })
    await page.waitForTimeout(20000)
    const file = `/srv/nsrgpt/public/viz-data/shots/${name}-${i++}.png`
    await page.screenshot({ path: file })
    const text = await page.evaluate(() => document.body.innerText.slice(0, 600))
    console.log(`== ${p} -> ${file}\n${text.replace(/\n+/g, " | ")}`)
  }
  console.log(logs.filter((l) => !/housekeeping|api\/warm/.test(l)).slice(0, 40).join("\n"))
  await browser.close()
})()
