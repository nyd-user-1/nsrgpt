// The force graph's 3D layout (/viz/graph's 3D switch, 2026-11-06), run once here like the 2D one
// (scripts/viz-graph-layout.mjs). d3-force-3d lays the same nodes and edges out in three dimensions, starting from the
// 2D layout's positions with a little depth, so the switch's morph from flat to 3D reads as one graph opening up.
// The result is scaled to the 2D layout's radius.
//
// Rerun after public/viz-data/decay.json or graph-layout.json changes:
//   D3_FORCE_3D=/path/to/node_modules/d3-force-3d node scripts/viz-graph-layout-3d.mjs
//
// Output — { source, k, x, y, z }: k the nuclide key (Z × 1000 + N), x y z its position, one decimal.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const d3 = await import(require.resolve(process.env.D3_FORCE_3D ?? "d3-force-3d"));

const decay = JSON.parse(readFileSync("public/viz-data/decay.json", "utf8"));
const flat = JSON.parse(readFileSync("public/viz-data/graph-layout.json", "utf8"));
const key = (z, n) => z * 1000 + n;
const index = new Map(decay.nuclides.map((x, i) => [key(x.z, x.n), i]));
const at = new Map(flat.k.map((k, i) => [k, i]));

// A fixed seed, so a rerun on the same data gives the same layout.
let seed = 0x5eed;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// The chart's nodes and edges, as app/(site)/viz/graph/model.ts builds them.
const nodes = decay.nuclides.map((x) => {
  const i = at.get(key(x.z, x.n));
  const [px, py] = i === undefined ? [(x.n - 90) * 4, (59 - x.z) * 4] : [flat.x[i], flat.y[i]];
  return { x: px, y: py, z: (random() - 0.5) * 40 };
});
const links = [];
decay.nuclides.forEach((x, from) => {
  for (const [mode] of x.m) {
    const m = decay.modes[mode];
    if (!m || m.dz === null || m.dn === null) continue;
    const to = index.get(key(x.z + m.dz, x.n + m.dn));
    if (to !== undefined && to !== from) links.push({ source: from, target: to });
  }
});

const sim = d3
  .forceSimulation(nodes, 3)
  .randomSource(random)
  .force("link", d3.forceLink(links).distance(10).strength(0.7))
  .force("charge", d3.forceManyBody().strength(-14).theta(0.9).distanceMax(220))
  .force("center", d3.forceCenter(0, 0, 0))
  .stop();
for (let i = 0; i < 500; i++) sim.tick();

const radius = (xs) => Math.max(...xs.map((p) => Math.hypot(...p)));
const r2 = radius(flat.x.map((x, i) => [x, flat.y[i]]));
const r3 = radius(nodes.map((p) => [p.x, p.y, p.z]));
const s = r2 / r3;
const round = (v) => Math.round(v * s * 10) / 10;
writeFileSync(
  "public/viz-data/graph-layout-3d.json",
  JSON.stringify({
    source: `d3-force-3d over decay.json's ${nodes.length} nuclides and ${links.length} decay links, from the 2D layout, ${new Date().toISOString().slice(0, 10)}`,
    k: decay.nuclides.map((x) => key(x.z, x.n)),
    x: nodes.map((p) => round(p.x)),
    y: nodes.map((p) => round(p.y)),
    z: nodes.map((p) => round(p.z)),
  }),
);
console.log(`${nodes.length} nodes, ${links.length} links, radius ${r2.toFixed(1)}`);
