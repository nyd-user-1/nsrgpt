// transmutation-u238-cm244.json (brief 29, file 1): the U-238 → Cm-244 transmutation figure's nodes.
// Reads:
//   nsr.endf_serve_xs, release B-VIII.1-point-293.6K (NNDC's reconstructed POINT2025 library at 293.6 K): σ(n,γ) MT 102
//     and σ(n,f) MT 18 at 0.0253 eV, linear in energy between the two points around it (POINT is linearized).
//   nsr.nuclide_serve_summary (ground-state half-life and decay modes) and nsr.nuclide_serve_levels (Am-242m, the
//     48.6 keV level of Am-242).
// Writes: public/viz-data/diagram/transmutation-u238-cm244.json, the CDN copy and lake/serve/diagram/ (lib.mjs).
//   node scripts/diagram/transmutation.mjs
// Output: { energy_ev, release, nuclides: [{ id, name, z, a, liso, sigmaCapture, sigmaFission, capturePct, fissionPct,
//   halfLife: {s, text}, decay: {alpha, betaMinus, ec, it, sf}, class }], rule, sources }
// The class (lead-agent's ruling on brief 29, 2026-11-08):
//   1. half-life under 1 year: shortlived;
//   2. else fissionPct ≥ 50: fissile;
//   3. else fertile when the capture product (Z, A+1 ground state), or what it β−-decays to, is fissile (the β− steps are
//      followed while the main decay is β−: U-239 → Np-239 → Pu-239);
//   4. else less fertile.
// "Fissile" in step 3 is the class from steps 1–2, so a short-lived product (Pu-243, Am-242, Am-244) doesn't count.
// The manifest entry keeps the comparison with the Sasahara figure (as hand-typed in lib/diagram/library/activation.ts);
// the numbers here are the lake's, pointwise at 0.0253 eV, and the figure's look spectrum-averaged.
import { athena, num, publish } from "./lib.mjs";

const E = 0.0253;
const RELEASE = "B-VIII.1-point-293.6K";
const YEAR = 365.2422 * 86400;
const LIST = ["U-238", "Pu-238", "Pu-239", "Pu-240", "Pu-241", "Pu-242", "Pu-243", "Am-241", "Am-242", "Am-242m", "Am-243",
  "Am-244", "Cm-242", "Cm-243", "Cm-244", "Cm-245"];
// The Sasahara figure's classes and fission percent, as hand-typed in lib/diagram/library/activation.ts (2026-11-08)
const FIGURE = {
  "U-238": ["fertile"], "Pu-238": ["fertile", 9], "Pu-239": ["fissile", 64], "Pu-240": ["fertile"], "Pu-241": ["fissile", 72],
  "Pu-242": ["less fertile"], "Pu-243": ["shortlived"], "Am-241": ["less fertile", 10], "Am-242": ["shortlived"],
  "Am-242m": ["fissile", 84], "Am-243": ["less fertile", 1], "Am-244": ["shortlived"], "Cm-242": ["shortlived", 1],
  "Cm-243": ["fissile", 85], "Cm-244": ["fertile", 4], "Cm-245": ["fissile", 85],
};

// σ at 0.0253 eV: i = number of points at or below E (arrays ascend, 1-based), then the points i and i+1
const xs = athena(`
  WITH x AS (SELECT name, z, a, liso, mt, n_points, n_served, energy_ev e, xs_barn s,
                    cardinality(filter(energy_ev, v -> v <= ${E})) i
             FROM endf_serve_xs
             WHERE release = '${RELEASE}' AND sublibrary = 'neutrons' AND mt IN (18, 102)
               AND name IN (${LIST.map((n) => `'${n}'`).join(",")}))
  SELECT name, z, a, liso, mt, n_points, n_served, e[i] e0, e[i + 1] e1, s[i] s0, s[i + 1] s1 FROM x`);
const sigma = {};
for (const r of xs) {
  const [e0, e1, s0, s1] = [r.e0, r.e1, r.s0, r.s1].map(Number);
  const v = e0 === E || e1 === e0 ? s0 : s0 + (s1 - s0) * (E - e0) / (e1 - e0);
  (sigma[r.name] ??= { z: +r.z, a: +r.a, liso: +r.liso })[r.mt === "18" ? "fission" : "capture"] = v;
}

const ensdfName = (n) => n.replace(/^([A-Z][a-z]?)-(\d+)m?$/, "$2$1");
// the listed nuclides and the β− chains of their capture products (U-239, Np-239 …), Z 92–97, A 238–247
const sumRows = athena(`SELECT name, z, a, half_life_s, half_life_text, decay_modes FROM nuclide_serve_summary
  WHERE z BETWEEN 92 AND 97 AND a BETWEEN 238 AND 247`);
const summary = Object.fromEntries(sumRows.map((r) => [r.name, r]));
const byZA = Object.fromEntries(sumRows.map((r) => [`${r.z},${r.a}`, r]));
const mainMode = (r) => (JSON.parse(r?.decay_modes || "[]").filter((m) => m.pct !== null).sort((x, y) => y.pct - x.pct)[0] || {}).mode;
const am242m = athena(`SELECT energy_kev, half_life_s, half_life_text, decay_modes_text FROM nuclide_serve_levels
  WHERE name = '242Am' AND energy_kev BETWEEN 40 AND 60 AND half_life_s IS NOT NULL`)[0];

const KEY = { A: "alpha", "B-": "betaMinus", EC: "ec", "EC+B+": "ec", "B+": "ec", IT: "it", SF: "sf" };
function modes(list) {
  const out = { alpha: 0, betaMinus: 0, ec: 0, it: 0, sf: 0 };
  for (const { mode, pct } of list) if (KEY[mode] && pct !== null) out[KEY[mode]] += pct;
  return out;
}
// "%A=0.450 10; %IT=99.550 10; %SF < 4.7E-9" → [{mode, pct}] (limits count as no value)
const parseText = (t) => t.split(";").map((p) => p.trim().match(/^%([A-Z+-]+)\s*=\s*([\d.E+-]+)/)).filter(Boolean)
  .map((m) => ({ mode: m[1], pct: Number(m[2]) }));
const round = (v, d = 4) => (v === null ? null : Number(v.toPrecision(d)));

const nuclides = LIST.map((id) => {
  const s = sigma[id];
  if (!s || s.capture === undefined || s.fission === undefined) throw new Error(`no MT 18/102 at ${E} eV for ${id}`);
  const capturePct = 100 * s.capture / (s.capture + s.fission);
  const meta = id === "Am-242m";
  const sum = summary[ensdfName(id)];
  const halfLife = meta ? { s: num(am242m.half_life_s), text: am242m.half_life_text }
    : { s: num(sum.half_life_s), text: sum.half_life_text };
  const decay = meta ? modes(parseText(am242m.decay_modes_text)) : modes(JSON.parse(sum.decay_modes || "[]"));
  const fissionPct = 100 - capturePct;
  // steps 1 and 2 here; 3 and 4 below, once every nuclide's steps 1–2 class is known
  const cls = halfLife.s !== null && halfLife.s < YEAR ? "shortlived" : fissionPct >= 50 ? "fissile" : null;
  return { id, name: ensdfName(id) + (meta ? "m" : ""), z: s.z, a: s.a, liso: s.liso,
    sigmaCapture: round(s.capture), sigmaFission: round(s.fission),
    capturePct: round(capturePct, 3), fissionPct: round(fissionPct, 3), halfLife,
    decay: Object.fromEntries(Object.entries(decay).map(([k, v]) => [k, round(v, 5)])), class: cls };
});
// steps 3 and 4: the capture product (ground state) and its β− descendants, while the main decay is β−
const fissile = new Set(nuclides.filter((n) => n.class === "fissile" && n.liso === 0).map((n) => `${n.z},${n.a}`));
for (const n of nuclides.filter((x) => x.class === null)) {
  const chain = [];
  let z = n.z, a = n.a + 1;
  for (let r = byZA[`${z},${a}`]; r; r = mainMode(r) === "B-" ? byZA[`${++z},${a}`] : null) chain.push(r);
  const hit = chain.find((r) => fissile.has(`${r.z},${r.a}`));
  n.class = hit ? "fertile" : "less fertile";
  n.classPath = chain.map((r) => r.name).join(" → ");
}

const RULE = "half-life under 1 year: shortlived; else fissionPct ≥ 50: fissile; else fertile when the capture product "
  + "(Z, A+1 ground state) or what it β−-decays to (following β− while it is the main decay) is fissile; else less fertile";
const comparison = nuclides.map((n) => ({ id: n.id, class: n.class, figureClass: FIGURE[n.id][0],
  fissionPct: n.fissionPct, figureFissionPct: FIGURE[n.id][1] ?? null }));
publish("transmutation-u238-cm244.json", {
  energy_ev: E, release: RELEASE, units: { sigma: "barn", pct: "percent of absorptions (capture + fission)" },
  rule: RULE,
  nuclides,
  sources: [`nsr.endf_serve_xs release ${RELEASE} (NNDC ENDF/B-VIII.1 POINT2025, 293.6 K), MT 102 and MT 18 at ${E} eV`,
    "nsr.nuclide_serve_summary and nsr.nuclide_serve_levels (ENSDF 2026-11-05 adopted levels)"],
}, [`nsr.endf_serve_xs (${RELEASE})`, "nsr.nuclide_serve_summary", "nsr.nuclide_serve_levels"], {
  rule: RULE,
  figureComparison: {
    note: "Against the Sasahara figure as hand-typed in lib/diagram/library/activation.ts. Our numbers are the lake's: "
      + "σ(n,f)/(σ(n,γ)+σ(n,f)) pointwise at 0.0253 eV from B-VIII.1-point-293.6K; the figure's percentages look "
      + "spectrum-averaged, so they differ where the cross sections change across the thermal range.",
    nuclides: comparison,
  },
});
for (const c of comparison) if (c.class !== c.figureClass) console.log("CLASS DIFFERS", c.id, c.class, "figure", c.figureClass);
for (const n of nuclides) console.log(n.id.padEnd(8), String(n.sigmaCapture).padStart(9), String(n.sigmaFission).padStart(9),
  String(n.capturePct).padStart(7), n.halfLife.text.padEnd(14), n.class.padEnd(13), n.classPath ?? "");
