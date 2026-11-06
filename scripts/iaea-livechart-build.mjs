// The site's files from the IAEA Live Chart pull (scripts/iaea-livechart-pull.mjs), 2026-11-06. Each chart loads only
// its own file, compact and columnar, from the worker's static assets; the live site never calls the IAEA.
//
//   public/viz-data/fission/<parent>.json   one per parent: every product's independent and cumulative yield,
//                                           per incident energy the parent has (/viz/fission-yields)
//   public/viz-data/livechart-ground.json   every ground state's properties (/viz/explorer)
//
//   node scripts/iaea-livechart-build.mjs <raw dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./iaea-livechart-csv.mjs";

const raw = process.argv[2];
if (!raw) throw new Error("usage: node scripts/iaea-livechart-build.mjs <raw dir>");
const OUT = "public/viz-data";
const DATE = "2026-11-06";

/** A number to `digits` significant figures, or null for a blank. */
const num = (s, digits = 4) => {
  if (s === undefined || s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? Number(v.toPrecision(digits)) : null;
};
const write = (file, data) => {
  const text = JSON.stringify(data);
  writeFileSync(join(OUT, file), text);
  console.log(`${file}: ${(text.length / 1024).toFixed(1)} KB`);
};

// ── fission yields ─────────────────────────────────────────────────────────────────────────────────
const PARENTS = ["232th", "233u", "235u", "238u", "237np", "239pu", "241pu", "241am"];
const ENERGIES = ["thermal", "fast", "14mev"];
mkdirSync(join(OUT, "fission"), { recursive: true });
const index = [];
for (const p of PARENTS) {
  const cum = parseCsv(readFileSync(join(raw, `fy/cumulative_${p}.csv`), "utf8"));
  const ind = parseCsv(readFileSync(join(raw, `fy/independent_${p}.csv`), "utf8"));
  // One row per product state (Z, A, level), from either file.
  const key = (r) => `${r.z_daughter}-${r.a_daughter}-${r.daughter_level_idx}`;
  const rows = new Map();
  for (const r of [...ind, ...cum]) if (!rows.has(key(r))) rows.set(key(r), { z: Number(r.z_daughter), a: Number(r.a_daughter), m: Number(r.daughter_level_idx) });
  const list = [...rows.entries()].sort(([, x], [, y]) => x.a - y.a || x.z - y.z || x.m - y.m);
  const byKey = (set) => new Map(set.map((r) => [key(r), r]));
  const I = byKey(ind);
  const C = byKey(cum);
  const energies = ENERGIES.filter((e) => ind.some((r) => r[`independent_${e}_fy`]));
  const first = cum[0];
  const out = {
    source: `IAEA Live Chart API (nds.iaea.org/relnsd/v1/data), JEFF-3.1.1 fission yields, ${DATE}`,
    parent: { z: Number(first.z_parent), a: Number(first.a_parent), el: first.element_parent },
    energies,
    z: list.map(([, r]) => r.z),
    a: list.map(([, r]) => r.a),
    m: list.map(([, r]) => r.m),
    ind: Object.fromEntries(energies.map((e) => [e, list.map(([k]) => num(I.get(k)?.[`independent_${e}_fy`]))])),
    cum: Object.fromEntries(energies.map((e) => [e, list.map(([k]) => num(C.get(k)?.[`cumulative_${e}_fy`]))])),
  };
  write(`fission/${p}.json`, out);
  index.push({ id: p, z: out.parent.z, a: out.parent.a, el: out.parent.el, energies });
}

// ── ground states ──────────────────────────────────────────────────────────────────────────────────
const gs = parseCsv(readFileSync(join(raw, "ground_states.csv"), "utf8"));
const els = [];
for (const r of gs) els[Number(r.z)] = r.symbol;
/** "5/2+" → [2.5, 1]; "(3)-" → [3, -1]; unknown → [null, null]. */
const spin = (jp) => {
  const m = /^\(?(\d+)(?:\/(\d+))?\)?\s*([+-])?/.exec((jp ?? "").replace(/[()]/g, ""));
  if (!m) return [null, null];
  const j = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  return [j, m[3] === "+" ? 1 : m[3] === "-" ? -1 : null];
};
const COLS = ["z", "n", "t", "mode", "pct", "qa", "qbm", "qbmn", "qec", "sn", "sp", "ba", "me", "radius", "abundance", "mu", "q", "j", "parity"];
const rowsOut = gs
  .filter((r) => r.z !== "" && r.n !== "")
  .map((r) => {
    const [j, parity] = spin(r.jp);
    return [
      Number(r.z), Number(r.n), num(r.half_life_sec, 5), r.decay_1 || null, num(r["decay_1_%"], 4),
      num(r.qa, 6), num(r.qbm, 6), num(r.qbm_n, 6), num(r.qec, 6), num(r.sn, 6), num(r.sp, 6), num(r.binding, 6), num(r.massexcess, 7),
      num(r.radius, 5), num(r.abundance, 5), num(r.magnetic_dipole, 5), num(r.electric_quadrupole, 4), j, parity,
    ];
  });
write("livechart-ground.json", {
  source: `IAEA Live Chart API (nds.iaea.org/relnsd/v1/data), ground states: ENSDF, AME2020, NUBASE2020, IAEA moments tables, Angeli–Marinova radii, ${DATE}`,
  els,
  cols: COLS,
  rows: rowsOut,
  fission: index,
});
