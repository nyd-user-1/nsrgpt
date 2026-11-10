// Brief 60 Part D: the morning QA drive, copied from the lead's /opt/shot/shot.js on the dev box. Runs there:
//   node drive.js <out dir> <target=url> [<target=url> …]      e.g. prod=https://nsrgpt.brendan-stanton.workers.dev box=http://localhost:3000
// Every page in PAGES, on every target, in light and dark: rendered yes/no, the first page error or console error, the
// first failed request, the time to the first paint of its data, and a screenshot <target>-<slug>-<theme>.png.
// "Data painted" is the later of the largest contentful paint and the last data response (/api/, the CDN, the API
// origin, /viz-data/) before the network went quiet, in ms from navigation start. Writes results.json to <out dir>.
const { chromium } = require('/opt/shot/node_modules/playwright')
const fs = require('fs')
const [, , out, ...targets] = process.argv
const PAGES = (process.env.PAGES || [
  '/', '/nsrcpt', '/about', '/sweep', '/sweep/medical', '/sweep/medical/ac225-ra226-gn', '/sweep/icrp', '/lab',
  '/graph', '/viz/chart', '/viz/structure', '/viz/matrix', '/viz/decay', '/chat', '/datasets/endf',
  '/datasets/endf/B-VIII.1/9228', '/datasets/exfor/10001', '/pipeline', '/data-dictionary', '/signin',
].join(' ')).split(' ')
const DATA = /\/api\/|cloudfront\.net|execute-api|\/viz-data\//
const BROKEN = /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error/
const NOISE = /\/api\/housekeeping|\/api\/warm|favicon/ // 403 and 429 on every box page (memory: devbox-screenshots)
const slug = (p) => (p === '/' ? 'home' : p.slice(1).replace(/[^A-Za-z0-9.-]+/g, '_'))

async function one(browser, target, base, path, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('theme', t); localStorage.removeItem('pax:theme') } catch {}
    window.__lcp = 0
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.max(window.__lcp, e.startTime) }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch {}
  }, theme)
  const p = await ctx.newPage()
  const errors = [], failed = []
  let t0 = 0, lastData = 0
  p.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 240)))
  // "Failed to load resource" repeats a response the listener below records with its URL
  p.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 240)) })
  p.on('requestfailed', (r) => { if (!NOISE.test(r.url()) && !/_rsc=/.test(r.url())) failed.push(`failed ${r.failure()?.errorText} ${r.url().slice(0, 140)}`) })
  p.on('response', (r) => {
    if (r.status() >= 400 && !NOISE.test(r.url())) failed.push(`${r.status()} ${r.url().slice(0, 140)}`)
    if (DATA.test(r.url()) && !NOISE.test(r.url())) lastData = Date.now() - t0
  })
  const row = { target, path, theme, rendered: false, status: null, error: null, failed: null, data_ms: null, lcp_ms: null, shot: null }
  try {
    t0 = Date.now()
    const resp = await p.goto(base + path, { waitUntil: 'networkidle', timeout: 120000 })
    row.status = resp ? resp.status() : null
    await p.waitForTimeout(2500)
    const m = await p.evaluate(() => ({ lcp: window.__lcp || 0, text: document.body ? document.body.innerText.slice(0, 4000) : '' }))
    row.lcp_ms = Math.round(m.lcp)
    row.data_ms = Math.max(row.lcp_ms, lastData)
    row.rendered = (row.status || 0) < 400 && !errors.some((e) => e.startsWith('pageerror')) && !BROKEN.test(m.text) && m.text.trim().length > 80
    if (BROKEN.test(m.text)) errors.unshift('page shows: ' + (m.text.match(BROKEN) || [''])[0])
  } catch (e) {
    errors.unshift('load: ' + String(e).slice(0, 240))
  }
  row.error = errors[0] || null
  row.errors = errors.length
  row.failed = failed[0] || null
  row.failures = failed.length
  row.failed_list = failed.slice(0, 10)
  row.error_list = errors.slice(0, 5)
  const file = `${target}-${slug(path)}-${theme}.png`
  try { await p.screenshot({ path: `${out}/${file}` }); row.shot = file } catch {}
  await ctx.close()
  console.log(JSON.stringify(row))
  return row
}

;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const rows = []
  for (const t of targets) {
    const [name, base] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]
    for (const path of PAGES) for (const theme of ['light', 'dark']) rows.push(await one(browser, name, base, path, theme))
  }
  await browser.close()
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(rows, null, 1))
})().catch((e) => { console.log('FAILED ' + String(e).slice(0, 400)); process.exit(1) })
