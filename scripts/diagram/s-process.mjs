// s-process-ag-sb.json and mass-201-210.json (brief 29, file 2): nuclide grids with the s-process path.
// Reads: livechart-ground.json from the chart CDN (IAEA Live Chart ground states, 2026-11-06): z, n, half-life, primary
//   decay mode and its percent, natural abundance.
// Writes: public/viz-data/diagram/{s-process-ag-sb,mass-201-210}.json, the CDN copies and lake/serve/diagram/ (lib.mjs).
//   node scripts/diagram/s-process.mjs
// Output: { title, range, nodes: [{id, z, n, a, symbol, stable, primordial, onPath, faint, halfLifeS, mode}],
//   edges: [{from, to, kind: capture|beta-|alpha, process: s|r, dashed?, leaves?, enters?}], rule, sources }
//   stable: no decay mode (the brief's rule). primordial: has a natural abundance (Cd-113, In-115, Bi-209 decay, but
//   so slowly that the s-process treats them as stable). onPath: on the s-process path. faint: stable or primordial
//   but off the path.
// The s-process rule: from a stable or primordial nuclide, capture a neutron (N+1). An unstable product whose main
//   decay is β− decays (Z+1, N−1); one whose main decay is α decays (Z−2, N−2) (Po-210 → Pb-206 closes the cycle);
//   any other unstable product (EC, as Cd-109 and Pb-205) captures again. The walk starts at each stable or primordial
//   nuclide of the lowest Z in the range (where the flow enters from below) and stops at a nuclide already visited.
// mass-201-210 adds the r-process β− feeding, dashed: down each isobar, from the lightest element shown (and from
//   gold, entering) through every nuclide whose main decay is β−, to the first stable or primordial isobar.
import { CDN, VERSION, publish } from "./lib.mjs";

const lc = await (await fetch(`${CDN}/viz-data/${VERSION}/livechart-ground.json`)).json();
const C = Object.fromEntries(lc.cols.map((c, i) => [c, i]));
const all = new Map();
for (const r of lc.rows) {
  const z = r[C.z], n = r[C.n];
  if (r[C.t] === null && r[C.mode] === null && r[C.abundance] === null) continue; // nothing known (unobserved)
  all.set(`${z},${n}`, { z, n, a: z + n, symbol: lc.els[z], t: r[C.t], mode: r[C.mode], pct: r[C.pct], ab: r[C.abundance] });
}
const get = (z, n) => all.get(`${z},${n}`);
const idOf = (x) => `${x.symbol}-${x.a}`;
const pathStable = (x) => x.mode === null || x.ab !== null;

function build(title, inRange, roots, rProcess) {
  const nodes = [...all.values()].filter(inRange).sort((p, q) => p.z - q.z || p.n - q.n);
  const edges = [], on = new Set();
  const edge = (from, to, kind, process, extra = {}) => edges.push({ from: idOf(from), to: idOf(to), kind, process, ...extra });
  for (const root of roots(nodes)) {
    let cur = root;
    on.add(idOf(cur));
    for (;;) {
      let next, kind;
      if (pathStable(cur) || !["B-", "A"].includes(cur.mode)) [next, kind] = [get(cur.z, cur.n + 1), "capture"];
      else if (cur.mode === "B-") [next, kind] = [get(cur.z + 1, cur.n - 1), "beta-"];
      else [next, kind] = [get(cur.z - 2, cur.n - 2), "alpha"];
      if (!next) break;
      if (!inRange(next)) { edge(cur, next, kind, "s", { leaves: true }); break; }
      if (edges.some((e) => e.from === idOf(cur) && e.to === idOf(next))) break;
      edge(cur, next, kind, "s");
      if (on.has(idOf(next))) break;
      on.add(idOf(next));
      cur = next;
    }
  }
  if (rProcess) {
    const zMin = Math.min(...nodes.map((x) => x.z));
    for (const a of [...new Set(nodes.map((x) => x.a))]) {
      const enter = get(zMin - 1, a - zMin + 1);
      let z0 = zMin;
      while (z0 <= zMin + 4 && !get(z0, a - z0)) z0++; // the lightest isobar the Live Chart has (no Hg-210)
      let cur = get(z0, a - z0);
      if (!cur) continue;
      if (z0 === zMin && enter && enter.mode === "B-") edge(enter, cur, "beta-", "r", { dashed: true, enters: true });
      while (cur && !pathStable(cur) && cur.mode === "B-") {
        const next = get(cur.z + 1, cur.n - 1);
        if (!next || !inRange(next)) break;
        edge(cur, next, "beta-", "r", { dashed: true });
        cur = next;
      }
    }
  }
  return {
    title,
    nodes: nodes.map((x) => ({ id: idOf(x), z: x.z, n: x.n, a: x.a, symbol: x.symbol, stable: x.mode === null,
      primordial: x.ab !== null, onPath: on.has(idOf(x)), faint: pathStable(x) && !on.has(idOf(x)),
      halfLifeS: x.t, mode: x.mode, modePct: x.pct })),
    edges,
    rule: "s-process: capture from stable or primordial nuclides; an unstable product decays by its main mode if β− or α, "
      + "otherwise captures again; walk from each stable or primordial nuclide of the lowest Z" + (rProcess
        ? ". r-process (dashed): β− down each isobar from the lightest element shown, and from Au entering, to the first stable or primordial isobar" : ""),
    sources: [`IAEA Live Chart ground states, ${CDN}/viz-data/${VERSION}/livechart-ground.json (ENSDF, NUBASE2020, 2026-11-06)`],
  };
}

// Ag to Sb: every nuclide of Z 47–51 with N one below the lightest to one above the heaviest stable or primordial one
const zs = (x) => x.z >= 47 && x.z <= 51;
const ns = [...all.values()].filter((x) => zs(x) && pathStable(x)).map((x) => x.n);
const [nLo, nHi] = [Math.min(...ns) - 1, Math.max(...ns) + 1];
const agsb = build("s-process from Ag to Sb", (x) => zs(x) && x.n >= nLo && x.n <= nHi,
  (nodes) => nodes.filter((x) => x.z === 47 && pathStable(x)), false);
agsb.range = { z: [47, 51], n: [nLo, nHi] };
publish("s-process-ag-sb.json", agsb, ["livechart-ground.json (IAEA Live Chart ground states, 2026-11-06)"]);

const m = build("Mass 201 to 210, Hg to Po", (x) => x.a >= 201 && x.a <= 210 && x.z >= 80 && x.z <= 84,
  (nodes) => nodes.filter((x) => x.a === 201 && x.z === 80 && pathStable(x)), true);
m.range = { a: [201, 210], z: [80, 84] };
publish("mass-201-210.json", m, ["livechart-ground.json (IAEA Live Chart ground states, 2026-11-06)"]);

for (const f of [agsb, m]) {
  console.log(f.title, f.nodes.length, "nodes;", "path:", f.nodes.filter((x) => x.onPath).map((x) => x.id).join(" "));
  console.log("  faint:", f.nodes.filter((x) => x.faint).map((x) => x.id).join(" "));
  console.log("  edges:", f.edges.map((e) => `${e.from}>${e.to}${e.process === "r" ? "(r)" : ""}${e.leaves ? "(out)" : ""}`).join(" "));
}
