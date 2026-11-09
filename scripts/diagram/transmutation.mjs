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
//   class by brief 29's rule: fissionPct ≥ 50 fissile; else half-life under 1 year shortlived; else capturePct ≥ 50
//   fertile; else less fertile.
import { athena, num, publish } from "./lib.mjs";

const E = 0.0253;
const RELEASE = "B-VIII.1-point-293.6K";
const YEAR = 365.2422 * 86400;
const LIST = ["U-238", "Pu-238", "Pu-239", "Pu-240", "Pu-241", "Pu-242", "Pu-243", "Am-241", "Am-242", "Am-242m", "Am-243",
  "Cm-242", "Cm-243", "Cm-244", "Cm-245"];

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
const names = [...new Set(LIST.map(ensdfName))];
const summary = Object.fromEntries(athena(`SELECT name, half_life_s, half_life_text, decay_modes FROM nuclide_serve_summary
  WHERE name IN (${names.map((n) => `'${n}'`).join(",")})`).map((r) => [r.name, r]));
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
  const cls = fissionPct >= 50 ? "fissile" : halfLife.s !== null && halfLife.s < YEAR ? "shortlived"
    : capturePct >= 50 ? "fertile" : "less fertile";
  return { id, name: ensdfName(id) + (meta ? "m" : ""), z: s.z, a: s.a, liso: s.liso,
    sigmaCapture: round(s.capture), sigmaFission: round(s.fission),
    capturePct: round(capturePct, 3), fissionPct: round(fissionPct, 3), halfLife,
    decay: Object.fromEntries(Object.entries(decay).map(([k, v]) => [k, round(v, 5)])), class: cls };
});

publish("transmutation-u238-cm244.json", {
  energy_ev: E, release: RELEASE, units: { sigma: "barn", pct: "percent of absorptions (capture + fission)" },
  rule: "fissionPct ≥ 50 fissile; else half-life under 1 year shortlived; else capturePct ≥ 50 fertile; else less fertile",
  nuclides,
  sources: [`nsr.endf_serve_xs release ${RELEASE} (NNDC ENDF/B-VIII.1 POINT2025, 293.6 K), MT 102 and MT 18 at ${E} eV`,
    "nsr.nuclide_serve_summary and nsr.nuclide_serve_levels (ENSDF 2026-11-05 adopted levels)"],
}, [`nsr.endf_serve_xs (${RELEASE})`, "nsr.nuclide_serve_summary", "nsr.nuclide_serve_levels"]);
for (const n of nuclides) console.log(n.id.padEnd(8), String(n.sigmaCapture).padStart(9), String(n.sigmaFission).padStart(9),
  String(n.capturePct).padStart(7), n.halfLife.text.padEnd(14), n.class, JSON.stringify(n.decay));
