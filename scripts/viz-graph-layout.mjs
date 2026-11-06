// The force graph's layout (/viz/graph, 2026-11-05): run once here instead of in every visitor's browser. Before
// this, each visit ran echarts-gl's GPU ForceAtlas2 for up to 2,000 steps, reading every position back off the GPU
// every 20 steps — an 821 ms long task at load, then a stall each few frames until it settled. This script runs
// that same layout, with the same settings, in headless Chrome, and writes where each nuclide ended up to
// public/viz-data/graph-layout.json. The chart draws from the file with layout 'none'.
//
// Rerun after public/viz-data/decay.json changes (positions are matched by nuclide, so a new nuclide without one
// falls back to its place on the chart of nuclides until then):
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/viz-graph-layout.mjs [node_modules dir]
// The node_modules dir holds echarts and echarts-gl (default ./node_modules).
//
// Output — { source, k, x, y }: k the nuclide key (Z × 1000 + N), x and y its position, one decimal.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const modules = resolve(process.argv[2] ?? "node_modules");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");

const decay = JSON.parse(readFileSync("public/viz-data/decay.json", "utf8"));
const key = (z, n) => z * 1000 + n;
const index = new Map(decay.nuclides.map((x, i) => [key(x.z, x.n), i]));

// The chart's nodes and edges, as app/(site)/viz/graph/chart.tsx and lib/viz-physics.ts decayLinks build them.
const nodes = decay.nuclides.map((x, i) => ({ id: String(i), x: (x.n - 90) * 4, y: (59 - x.z) * 4 }));
const edges = [];
decay.nuclides.forEach((x, from) => {
  for (const [mode] of x.m) {
    const m = decay.modes[mode];
    if (!m || m.dz === null || m.dn === null) continue;
    const to = index.get(key(x.z + m.dz, x.n + m.dn));
    if (to !== undefined && to !== from) edges.push({ source: String(from), target: String(to) });
  }
});

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1386, height: 766 } });
await page.setContent('<div id="c" style="width:1386px;height:766px"></div>');
await page.addScriptTag({ path: `${modules}/echarts/dist/echarts.min.js` });
await page.addScriptTag({ path: `${modules}/echarts-gl/dist/echarts-gl.min.js` });
const points = await page.evaluate(
  ({ nodes, edges }) =>
    new Promise((done, fail) => {
      const chart = window.echarts.init(document.getElementById("c"));
      // graphGLStopLayout's event; by then echarts-gl has synced the positions into the series data.
      chart.on("graphgllayoutstopped", () => done(Array.from(chart.getModel().getSeriesByIndex(0).getData().getLayout("points"))));
      setTimeout(() => fail(new Error("layout did not finish in 3 minutes")), 180_000);
      chart.setOption({
        series: [
          {
            type: "graphGL",
            nodes,
            edges,
            forceAtlas2: { steps: 5, maxSteps: 2000, stopThreshold: 1, jitterTolerence: 10, edgeWeight: [1, 2], gravity: 0.3, strongGravityMode: true, scaling: 0.9 },
          },
        ],
      });
    }),
  { nodes, edges },
);
await browser.close();

const round = (v) => Math.round(v * 10) / 10;
const out = {
  source: `echarts-gl ${require(`${modules}/echarts-gl/package.json`).version} ForceAtlas2 over decay.json's ${nodes.length} nuclides and ${edges.length} decay links, ${new Date().toISOString().slice(0, 10)}`,
  k: decay.nuclides.map((x) => key(x.z, x.n)),
  x: nodes.map((_, i) => round(points[i * 2])),
  y: nodes.map((_, i) => round(points[i * 2 + 1])),
};
writeFileSync("public/viz-data/graph-layout.json", JSON.stringify(out));
console.log(`${out.k.length} positions → public/viz-data/graph-layout.json`);
