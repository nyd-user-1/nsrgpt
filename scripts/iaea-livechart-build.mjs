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

// ── decay radiation ────────────────────────────────────────────────────────────────────────────────
// Ground-state decays only (an isomer's decay rows carry its level energy as p_energy). Intensities are per 100
// decays of the parent, every mode together (²¹²Bi: α lines 35.95, β− 64.06), so a line's energy times its
// intensity / 100 is its share of an average decay.
//
//   public/viz-data/decay-energy.json   per nuclide, keV per decay: what stays in a sample (α, the daughter's
//                                       recoil, β mean energies, electrons) and what leaves it (γ, X-rays,
//                                       annihilation photons, neutrinos) — the particle view's heat
//   public/viz-data/radiation/<Z>.json  per element, each isotope's lines by type — the decay radiation card
//   public/viz-data/gamma/<bin>.json    every decay γ line, 100 keV to a file, sorted by energy — the γ-line finder
//   public/viz-data/gamma/index.json    which slices exist, and the element symbols
const RAD = ["a", "bm", "bp", "g", "e", "x"];
const radiation = new Map(); // key z*1000+n → { z, n, el, t, lines: { a, bm, bp, ec, g, e, x } }
const ground = (r) => r.p_energy === "0" || r.p_energy === "";
const nucOf = (r) => {
  const z = Number(r.p_z);
  const n = Number(r.p_n);
  const k = z * 1000 + n;
  if (!radiation.has(k)) radiation.set(k, { z, n, el: r.p_symbol, t: num(r.half_life_sec, 5), lines: {} });
  return radiation.get(k);
};
/** Lines below this intensity (per 100 decays) are left out of the files: the charts' axes stop there, and their
 *  energy is a negligible share of a decay's. The per-nuclide energies are summed before this cut. */
const FLOOR = 1e-4;
const push = (rec, type, line) => (rec.lines[type] ??= []).push(line);
for (const type of RAD) {
  let files = [];
  try {
    files = (await import("node:fs")).readdirSync(join(raw, "decay_rads", type));
  } catch {
    continue;
  }
  for (const f of files) {
    const text = readFileSync(join(raw, "decay_rads", type, f), "utf8");
    if (!text.includes(",")) continue; // the API's "no data" answer is a bare code
    for (const r of parseCsv(text).filter(ground)) {
      const rec = nucOf(r);
      if (type === "a") {
        const e = num(r.energy, 6), i = num(r.intensity, 4);
        if (e && i) push(rec, "a", [e, i]);
      } else if (type === "bm" || type === "bp") {
        const mean = num(r.mean_energy, 6), end = num(r.max_energy ?? r["max_energy"], 6), i = num(r.intensity_beta, 4);
        const nu = num(type === "bm" ? r.anti_nu_mean_energy : r.nu_mean_energy, 6);
        if (mean && i) push(rec, type, [mean, end, i, nu]);
        if (type === "bp") {
          const ie = num(r.intensity_ec, 4), ee = num(r.energy_ec, 6);
          if (ie) push(rec, "ec", [ee, ie]);
        }
      } else {
        const e = num(r.energy, 6), i = num(r.intensity, 4);
        if (e && i) push(rec, type, type === "e" ? [e, i, r.type === "AU" ? "Auger" : `CE ${r.shell ?? ""}`.trim()] : [e, i]);
      }
    }
  }
}
// ENSDF lists some X-ray lines among the γ rays too (²⁴¹Am's 17.14 keV Np L X-rays, 36.6 per 100 decays, are in
// both): a γ line matching one of the nuclide's X-ray lines in energy and intensity is the same line, kept once.
let twins = 0;
for (const r of radiation.values()) {
  const xs = r.lines.x ?? [];
  if (!xs.length || !r.lines.g) continue;
  const before = r.lines.g.length;
  r.lines.g = r.lines.g.filter(([e, i]) => !xs.some(([xe, xi]) => Math.abs(xe - e) < 0.01 && Math.abs(xi - i) <= 1e-6 * Math.max(1, i)));
  twins += before - r.lines.g.length;
  if (!r.lines.g.length) delete r.lines.g;
}
console.log(`γ lines that repeat an X-ray line, dropped: ${twins}`);

if (radiation.size) {
  // keV per decay, by where it goes.
  const sum = (list, f) => (list ?? []).reduce((s, l) => s + f(l), 0);
  const rows = [...radiation.values()]
    .sort((a, b) => a.z - b.z || a.n - b.n)
    .map((r) => {
      const A = r.z + r.n;
      const L = r.lines;
      const alpha = sum(L.a, ([e, i]) => (e * i) / 100);
      const recoil = sum(L.a, ([e, i]) => (e * i * 4) / Math.max(1, A - 4) / 100);
      const beta = sum(L.bm, ([m, , i]) => (m * i) / 100) + sum(L.bp, ([m, , i]) => (m * i) / 100);
      const electron = sum(L.e, ([e, i]) => (e * i) / 100);
      const gamma = sum(L.g, ([e, i]) => (e * i) / 100);
      const xray = sum(L.x, ([e, i]) => (e * i) / 100);
      const annihilation = sum(L.bp, ([, , i]) => (1021.998 * i) / 100);
      const neutrino = sum(L.bm, ([, , i, nu]) => ((nu ?? 0) * i) / 100) + sum(L.bp, ([, , i, nu]) => ((nu ?? 0) * i) / 100) + sum(L.ec, ([e, i]) => ((e ?? 0) * i) / 100);
      return [r.z, r.n, ...[alpha, recoil, beta, electron, gamma, xray, annihilation, neutrino].map((v) => num(v, 5))];
    });
  write("decay-energy.json", {
    source: `IAEA Live Chart API (nds.iaea.org/relnsd/v1/data), ENSDF decay radiation of ground states, ${DATE}`,
    cols: ["z", "n", "alpha", "recoil", "beta", "electron", "gamma", "xray", "annihilation", "neutrino"],
    rows,
  });

  // Per element, every isotope's lines of at least FLOOR.
  for (const r of radiation.values())
    for (const t of Object.keys(r.lines)) {
      const at = t === "bm" || t === "bp" ? 2 : 1;
      r.lines[t] = r.lines[t].filter((l) => l[at] >= FLOOR);
      if (!r.lines[t].length) delete r.lines[t];
    }
  mkdirSync(join(OUT, "radiation"), { recursive: true });
  const byZ = new Map();
  for (const r of radiation.values()) byZ.set(r.z, [...(byZ.get(r.z) ?? []), r]);
  let total = 0;
  for (const [z, list] of byZ) {
    const text = JSON.stringify({ z, el: list[0].el, nuclides: list.sort((a, b) => a.n - b.n).map(({ n, t, lines }) => ({ n, t, lines })) });
    writeFileSync(join(OUT, "radiation", `${z}.json`), text);
    total += text.length;
  }
  console.log(`radiation/: ${byZ.size} files, ${(total / 1024).toFixed(0)} KB`);

  // γ lines by energy.
  mkdirSync(join(OUT, "gamma"), { recursive: true });
  const lines = [];
  for (const r of radiation.values()) for (const [e, i] of r.lines.g ?? []) lines.push([e, i, r.z, r.n]);
  lines.sort((a, b) => a[0] - b[0]);
  const BIN = 100;
  const bins = new Map();
  for (const l of lines) {
    const b = Math.floor(l[0] / BIN);
    bins.set(b, [...(bins.get(b) ?? []), l]);
  }
  for (const [b, list] of bins) writeFileSync(join(OUT, "gamma", `${b}.json`), JSON.stringify(list));
  write("gamma/index.json", { source: `IAEA Live Chart API (nds.iaea.org/relnsd/v1/data), ENSDF decay γ lines of ground states, ${DATE}`, bin: BIN, bins: [...bins.keys()].sort((a, b) => a - b), els, count: lines.length });
  console.log(`gamma/: ${lines.length} lines in ${bins.size} files`);
}
