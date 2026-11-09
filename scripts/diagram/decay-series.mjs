// decay-series.json (brief 29, file 5): the four natural decay series' members with half-life text as the figures
// print it ("1.41e+10 Years", "3.6 Days", "55 Seconds", "Stable").
// Reads: nsr.nuclide_serve_summary (ENSDF 2026-11-05 adopted ground states: half-life, decay modes with percent).
// Writes: public/viz-data/diagram/decay-series.json, the CDN copy and lake/serve/diagram/ (lib.mjs).
//   node scripts/diagram/decay-series.mjs
// Members: every nuclide reached from the series' start by α, β− or EC/β+ branches with a stated percent above 0
// (spontaneous fission, cluster decay and limits are left out). Starts at the californium isotope at the top of each
// series (Cf-252, Cf-249, Cf-250, Cf-251), which reaches Th-232, Np-237, U-238 and U-235 on the way down.
// Output: { series: { thorium|neptunium|uranium|actinium: { label, start, members: [{id, name, z, a, symbol,
//   halfLifeS, halfLife, ensdf, decays: [{mode, pct, to}]}] } }, format, sources }
//   halfLife: the figure's text; ensdf: ENSDF's own text ("1.40E10 Y 1").
import { athena, num, publish } from "./lib.mjs";

const SERIES = {
  thorium: { label: "Thorium series (4n)", start: "252Cf" },
  neptunium: { label: "Neptunium series (4n+1)", start: "249Cf" },
  uranium: { label: "Uranium series (4n+2)", start: "250Cf" },
  actinium: { label: "Actinium series (4n+3)", start: "251Cf" },
};
const rows = athena(`SELECT name, z, a, half_life_s, half_life_text, decay_modes FROM nuclide_serve_summary
  WHERE z BETWEEN 78 AND 98 AND a BETWEEN 200 AND 253`);
const byZA = new Map(rows.map((r) => [`${r.z},${r.a}`, r]));
const STEP = { A: [-2, -4], "B-": [1, 0], EC: [-1, 0], "EC+B+": [-1, 0], "B+": [-1, 0] };

// the figures' half-life text: the largest unit that keeps the value ≥ 1, three significant digits, e-notation from 1e5
const UNITS = [["Years", 365.2422 * 86400], ["Days", 86400], ["Hours", 3600], ["Minutes", 60], ["Seconds", 1],
  ["Milliseconds", 1e-3], ["Microseconds", 1e-6], ["Nanoseconds", 1e-9]];
function figureText(s, modes) {
  if (s === null) return modes.length ? null : "Stable";
  const [unit, f] = UNITS.find(([, f]) => s / f >= 1) ?? UNITS[UNITS.length - 1];
  const v = s / f;
  return `${v >= 1e5 ? v.toExponential(2) : String(Number(v.toPrecision(3)))} ${unit}`;
}

const out = {};
for (const [key, { label, start }] of Object.entries(SERIES)) {
  const first = rows.find((r) => r.name === start);
  const seen = new Map(), queue = [first];
  while (queue.length) {
    const r = queue.shift();
    if (seen.has(r.name)) continue;
    const decays = [];
    for (const m of JSON.parse(r.decay_modes || "[]")) {
      // an approximate value ("AP 100", Cf-251's α) counts, marked approx
      const ap = m.pct === null && /^(AP|~)\s*([\d.]+(E[+-]?\d+)?)/.exec(m.text || "");
      const pct = ap ? Number(ap[2]) : m.pct;
      if (!STEP[m.mode] || !(pct > 0)) continue;
      const d = byZA.get(`${+r.z + STEP[m.mode][0]},${+r.a + STEP[m.mode][1]}`);
      if (!d) continue;
      decays.push({ mode: m.mode, pct, ...(ap ? { approx: true } : {}), to: d.name });
      queue.push(d);
    }
    const s = num(r.half_life_s);
    seen.set(r.name, { id: `${r.name.replace(/^\d+/, "")}-${r.a}`, name: r.name, z: +r.z, a: +r.a,
      symbol: r.name.replace(/^\d+/, ""), halfLifeS: s, halfLife: figureText(s, decays), ensdf: r.half_life_text, decays });
  }
  out[key] = { label, start, members: [...seen.values()].sort((p, q) => q.a - p.a || q.z - p.z) };
}
publish("decay-series.json", {
  series: out,
  format: "halfLife: the largest unit that keeps the value at least 1 (Years, Days, Hours, Minutes, Seconds, "
    + "Milliseconds, Microseconds, Nanoseconds), three significant digits, e-notation from 1e5; Stable when no decay",
  sources: ["nsr.nuclide_serve_summary (ENSDF 2026-11-05 adopted ground states)"],
}, ["nsr.nuclide_serve_summary"]);
for (const [k, s] of Object.entries(out)) console.log(k, s.members.length, s.members.map((m) => `${m.id}:${m.halfLife}`).join(" | ").slice(0, 600));
