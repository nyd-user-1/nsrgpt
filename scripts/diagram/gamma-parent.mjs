// gamma-parent/<z>.json (brief 29, Part B): the γ lines of each ground-state decay, grouped by the decaying nuclide,
// for /viz/gamma-lines' one-nuclide view (Co-60 by default).
// Reads: the chart CDN's gamma/index.json and gamma/<bin>.json (every γ line of every ground-state decay in ENSDF, from
//   the IAEA Live Chart API, 100 keV a file: [energy keV, intensity per 100 decays, parent Z, parent N]).
// Writes: public/viz-data/gamma-parent/<z>.json and index.json, uploaded to site/viz-data/v20261108/gamma-parent/.
//   node scripts/diagram/gamma-parent.mjs
// Output: <z>.json { z, el, parents: { <n>: [[energy, intensity], …] } }, lines by energy;
//   index.json { source, parents: [[z, n, lines], …] }.
// The nsr-api's /nuclide/{name}/gammas lists the transitions inside the named nucleus (Co-60's own levels), not the
// lines its decay emits (which sit in the daughter, Ni-60), so this chart reads the decay lines from these files.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKET, CDN, ROOT, VERSION, aws } from "./lib.mjs";

const base = `${CDN}/viz-data/${VERSION}/gamma`;
const idx = await (await fetch(`${base}/index.json`)).json();
const byZ = new Map();
let total = 0;
for (const b of idx.bins) {
  const lines = await (await fetch(`${base}/${b}.json`)).json();
  for (const [e, i, z, n] of lines) {
    const p = ((byZ.get(z) ?? byZ.set(z, {}).get(z))[n] ??= []);
    p.push([e, i]);
    total++;
  }
}
if (total !== idx.count) throw new Error(`read ${total} lines, the index says ${idx.count}`);
const dir = join(ROOT, "public", "viz-data", "gamma-parent");
mkdirSync(dir, { recursive: true });
const index = [];
for (const [z, parents] of [...byZ.entries()].sort((a, b) => a[0] - b[0])) {
  for (const [n, ls] of Object.entries(parents)) {
    ls.sort((a, b) => a[0] - b[0]);
    index.push([z, Number(n), ls.length]);
  }
  writeFileSync(join(dir, `${z}.json`), JSON.stringify({ z, el: idx.els[z], parents }));
}
writeFileSync(join(dir, "index.json"), JSON.stringify({
  source: "ENSDF ground-state decay γ lines via the IAEA Live Chart API (2026-11-06), regrouped by parent from gamma/<bin>.json",
  parents: index,
}));
aws("s3", "sync", dir, `s3://${BUCKET}/site/viz-data/${VERSION}/gamma-parent`, "--content-type", "application/json",
  "--cache-control", "public, max-age=31536000, immutable", "--only-show-errors");
console.log(`${total} lines, ${index.length} parents, ${byZ.size} files → ${CDN}/viz-data/${VERSION}/gamma-parent/`);
