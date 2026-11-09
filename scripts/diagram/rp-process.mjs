// rp-process.json (brief 29, file 3): the rp-process path of proton captures and β+ decays, Ni-56 to Sn-100.
// Reads: livechart-ground.json from the chart CDN (IAEA Live Chart ground states, 2026-11-06): half-life, main decay
//   mode, proton separation energy Sp (keV, AME2020).
// Writes: public/viz-data/diagram/rp-process.json, the CDN copy and lake/serve/diagram/ (lib.mjs).
//   node scripts/diagram/rp-process.mjs
// The Wikipedia article (Rp-process, revision 1370228252, 2026-08-19) describes the process: consecutive proton
// captures on the proton-rich side, timed by β+ decays at or near the proton drip line, ending near 107Te in the
// Sn–Sb–Te cycle. Neither the article nor its figure (Rapid Proton Capture.svg, a schematic grid) names the waiting
// points, so the path is computed from that description:
//   from Ni-56 (Z = N = 28), capture a proton when the product (Z+1, N) is proton-bound (Sp > 0); otherwise the
//   nuclide waits for its β+ decay to (Z−1, N+1). Stop at Sn-100. A waiting point is a nuclide the path leaves by β+.
// Output: { nodes: [{id, z, n, a, symbol, halfLifeS, spKev, waiting}], edges: [{from, to, kind: p-capture|beta+}],
//   rule, sources }
import { CDN, VERSION, publish } from "./lib.mjs";

const lc = await (await fetch(`${CDN}/viz-data/${VERSION}/livechart-ground.json`)).json();
const C = Object.fromEntries(lc.cols.map((c, i) => [c, i]));
const all = new Map(lc.rows.map((r) => [`${r[C.z]},${r[C.n]}`, r]));
const node = (z, n) => {
  const r = all.get(`${z},${n}`);
  return r && { id: `${lc.els[z]}-${z + n}`, z, n, a: z + n, symbol: lc.els[z], halfLifeS: r[C.t], mode: r[C.mode], spKev: r[C.sp] };
};

const nodes = [], edges = [];
let cur = node(28, 28);
nodes.push(cur);
for (let guard = 0; guard < 400 && !(cur.z === 50 && cur.n === 50); guard++) {
  const p = node(cur.z + 1, cur.n);
  const bound = p && p.spKev !== null && p.spKev > 0;
  const next = bound ? p : node(cur.z - 1, cur.n + 1);
  if (!next) throw new Error(`path stops at ${cur.id}`);
  if (!bound) cur.waiting = true;
  edges.push({ from: cur.id, to: next.id, kind: bound ? "p-capture" : "beta+" });
  nodes.push(next);
  cur = next;
}
publish("rp-process.json", {
  title: "rp-process, Ni-56 to Sn-100",
  nodes: nodes.map(({ mode, ...x }) => ({ ...x, mainMode: mode, waiting: !!x.waiting })),
  edges,
  rule: "from Ni-56, proton capture when the product is proton-bound (Sp > 0), otherwise β+ decay; stop at Sn-100; "
    + "a waiting point is a nuclide the path leaves by β+",
  sources: ["Wikipedia, \"Rp-process\", revision 1370228252 (2026-08-19), https://en.wikipedia.org/wiki/Rp-process: the "
    + "process as described (proton captures, β+ decays near the proton drip line, end near 107Te)",
    `IAEA Live Chart ground states, ${CDN}/viz-data/${VERSION}/livechart-ground.json: Sp (AME2020), half-lives`],
}, ["Wikipedia Rp-process rev 1370228252", "livechart-ground.json (Sp, half-lives)"]);
const w = nodes.filter((x) => x.waiting);
console.log(nodes.length, "nodes,", edges.length, "edges;", w.length, "waiting points:",
  w.map((x) => `${x.id}(${x.halfLifeS === null ? "?" : x.halfLifeS.toPrecision(3) + "s"})`).join(" "));
