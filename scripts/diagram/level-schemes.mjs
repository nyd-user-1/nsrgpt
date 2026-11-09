// level-schemes/{co60,au198,po210}.json (brief 29, file 4): decay level schemes, parent over daughter levels.
// Reads:
//   ENSDF 2026-11-05 decay datasets in Athena: nsr.ensdf_datasets, ensdf_parents (parent level, half-life, Q),
//     ensdf_normalization (NR, BR, NB), ensdf_levels, ensdf_gammas, ensdf_betas, ensdf_ec, ensdf_alphas. The decay
//     dataset decides which daughter levels and gammas the figure shows, and gives intensities per 100 decays.
//   nsr.nuclide_serve_summary for the parent (half-life, Jπ).
//   The nsr-api's adopted levels and gammas, /nuclide/{daughter}/levels and /gammas: Jπ, half-life and the gamma's
//     from/to levels, matched to the decay dataset's levels by energy.
// Writes: public/viz-data/diagram/level-schemes/<id>.json, the CDN copy and lake/serve/diagram/ (lib.mjs).
//   node scripts/diagram/level-schemes.mjs
// Output: { id, parent: {name, z, a, symbol, jpi, halfLife}, daughter: {name, z, a, symbol}, mode, qKev, dataset,
//   levels: [{energy, jpi, halfLife, feeding}], gammas: [{from, to, energy, intensity, mult}],
//   branches: [{mode, toLevel, pct}], sources }
//   energies in keV; feeding, intensity and pct per 100 decays of the parent.
import { api, athena, num, publish } from "./lib.mjs";

const CASES = [
  { id: "co60", parent: "60Co", daughter: "60Ni", nucid: "60NI", dsid: "60CO B- DECAY (1925.28 D)", mode: "B-" },
  { id: "au198", parent: "198Au", daughter: "198Hg", nucid: "198HG", dsid: "198AU B- DECAY (2.6941 D)", mode: "B-" },
  { id: "po210", parent: "210Po", daughter: "206Pb", nucid: "206PB", dsid: "210PO A DECAY", mode: "A" },
];
const IN = (xs) => xs.map((x) => `'${x}'`).join(",");

const ds = athena(`SELECT d.dataset_seq, trim(d.nucid) nucid, d.dsid, p.energy_kev p_e, p.jpi p_jpi, p.half_life_raw p_t,
    p.half_life_unc_raw p_tu, p.qp, n.nr, n.br, n.nb
  FROM ensdf_datasets d
  LEFT JOIN ensdf_parents p ON p.dataset_seq = d.dataset_seq
  LEFT JOIN ensdf_normalization n ON n.dataset_seq = d.dataset_seq AND n.kind = 'N'
  WHERE d.dsid IN (${IN(CASES.map((c) => c.dsid))}) AND trim(d.nucid) IN (${IN(CASES.map((c) => c.nucid))})`);
const seqs = ds.map((d) => d.dataset_seq).join(",");
const by = (rows) => rows.reduce((m, r) => ((m[r.dataset_seq] ??= []).push(r), m), {});
const levels = by(athena(`SELECT dataset_seq, level_seq, energy_kev, jpi, half_life_raw, half_life_unc_raw FROM ensdf_levels
  WHERE dataset_seq IN (${seqs}) ORDER BY dataset_seq, energy_kev`));
const gammas = by(athena(`SELECT dataset_seq, level_seq, e_gamma, ri, ri_unc, mult FROM ensdf_gammas
  WHERE dataset_seq IN (${seqs}) ORDER BY dataset_seq, card_seq`));
const feeds = by(athena(`SELECT dataset_seq, level_seq, 'B-' mode, ib i FROM ensdf_betas WHERE dataset_seq IN (${seqs})
  UNION ALL SELECT dataset_seq, level_seq, 'EC', coalesce(ib, 0) + coalesce(ie, 0) FROM ensdf_ec WHERE dataset_seq IN (${seqs})
  UNION ALL SELECT dataset_seq, level_seq, 'A', ia FROM ensdf_alphas WHERE dataset_seq IN (${seqs})`));
const parents = Object.fromEntries(athena(`SELECT name, z, a, symbol, jpi_ground, half_life_s, half_life_text
  FROM nuclide_serve_summary WHERE name IN (${IN(CASES.flatMap((c) => [c.parent, c.daughter]))})`).map((r) => [r.name, r]));

async function adopted(name, part) {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await api(`/nuclide/${name}/${part}?page=${page}`);
    out.push(...r[part]);
    if (page >= r.pages) return out;
  }
}
const r4 = (v) => (v === null ? null : Number(v.toPrecision(4)));

for (const c of CASES) {
  const d = ds.find((x) => x.dsid === c.dsid && x.nucid === c.nucid);
  const [nr, br, nb] = [num(d.nr) ?? 1, num(d.br) ?? 1, num(d.nb)];
  const P = parents[c.parent], D = parents[c.daughter];
  const A = Number(D.a);
  const adoptedLevels = await adopted(c.daughter, "levels");
  const adoptedGammas = await adopted(c.daughter, "gammas");
  const match = (e) => adoptedLevels.reduce((best, l) =>
    Math.abs(l.energy_kev - e) <= Math.max(1, 0.002 * e) && (!best || Math.abs(l.energy_kev - e) < Math.abs(best.energy_kev - e)) ? l : best, null);

  const dl = levels[d.dataset_seq];
  const feeding = {};
  for (const f of feeds[d.dataset_seq] ?? []) {
    if (f.i === null) continue;
    // IB × NB × BR per 100 parent decays (NB blank: IB is already per 100 decays of the branch); IA is % of α decays
    const pct = c.mode === "A" ? Number(f.i) * br : Number(f.i) * (nb ?? 1) * (nb === null ? 1 : br);
    feeding[f.level_seq] = { mode: f.mode, pct };
  }
  const outLevels = dl.map((l) => {
    const a = match(Number(l.energy_kev));
    return { energy: a ? a.energy_kev : Number(l.energy_kev), jpi: a?.jpi ?? l.jpi,
      halfLife: a ? { s: a.half_life_s, text: a.half_life_text } : { s: null, text: [l.half_life_raw, l.half_life_unc_raw].filter(Boolean).join(" ") || null },
      feeding: feeding[l.level_seq] ? r4(feeding[l.level_seq].pct) : null };
  });
  const levelBySeq = Object.fromEntries(dl.map((l, i) => [l.level_seq, outLevels[i]]));
  const outGammas = (gammas[d.dataset_seq] ?? []).map((g) => {
    const from = levelBySeq[g.level_seq];
    const eg = Number(g.e_gamma);
    // final level: nearest level to E_initial − Eγ − recoil (Eγ²/2Mc²)
    const target = from.energy - eg - eg * eg / (2 * A * 931494.1);
    const to = outLevels.reduce((b, l) => (Math.abs(l.energy - target) < Math.abs(b.energy - target) ? l : b));
    const ag = adoptedGammas.find((x) => Math.abs(x.level_energy_kev - from.energy) < 1 && Math.abs(x.e_gamma_kev - eg) < 1);
    return { from: from.energy, to: ag ? ag.final_level_energy_kev : to.energy, energy: ag ? ag.e_gamma_kev : eg,
      intensity: g.ri === null ? null : r4(Number(g.ri) * nr * br), mult: ag?.mult ?? g.mult ?? null };
  });
  const branches = Object.entries(feeding).map(([seq, f]) => ({ mode: f.mode, toLevel: levelBySeq[seq].energy, pct: r4(f.pct) }))
    .sort((x, y) => y.pct - x.pct);
  const sym = (n) => n.replace(/^\d+/, "");
  const obj = {
    id: c.id,
    parent: { name: c.parent, z: +P.z, a: +P.a, symbol: sym(c.parent), jpi: P.jpi_ground,
      halfLife: { s: num(P.half_life_s), text: P.half_life_text } },
    daughter: { name: c.daughter, z: +D.z, a: A, symbol: sym(c.daughter) },
    mode: c.mode, qKev: num(d.qp), dataset: c.dsid, normalization: { nr: num(d.nr), br: num(d.br), nb },
    levels: outLevels, gammas: outGammas, branches,
    sources: [`ENSDF 2026-11-05 decay dataset "${c.dsid}" (nsr.ensdf_*): levels shown, feeding and γ intensities per 100 decays`,
      `nsr-api /nuclide/${c.daughter}/levels and /gammas (ENSDF adopted levels): Jπ, half-lives, γ from/to`,
      "nsr.nuclide_serve_summary: parent half-life and Jπ"],
  };
  publish(`level-schemes/${c.id}.json`, obj, [`ENSDF decay dataset ${c.dsid}`, `nsr-api /nuclide/${c.daughter}/levels, /gammas`,
    "nsr.nuclide_serve_summary"]);
  console.log(c.id, "Q", obj.qKev, "NR/BR/NB", nr, br, nb);
  for (const l of outLevels) console.log("  L", l.energy, l.jpi, l.halfLife.text, "feed", l.feeding);
  for (const g of outGammas) console.log("  G", g.energy, g.from, "→", g.to, "I", g.intensity, g.mult);
}
