import type { SweepFlags, SweepList, SweepPair, SweepReleases, SweepRetro, SweepRow } from "@/lib/sweep"

// Sample answers in the sweep routes' shapes (brief 57), for /sweep and /sweep/pair until worker-3's routes answer
// (brief 58, Part C). Invented to fill the layout, not measured: the pages say "sample rows" whenever one is shown.

const pair = (target: string, za: number, mt: number, reaction: string, z: number, mlr: number, n: number, ds: number, e: number): SweepRow => ({
  target_za: za,
  target,
  sublibrary: "neutrons",
  mt,
  reaction,
  n_points: n,
  n_datasets: ds,
  n_bins: 24,
  mean_log_ratio: mlr,
  mean_ratio: Math.exp(mlr),
  z,
  max_bin_dev: mlr * 2.4,
  max_bin_e_ev: e,
  rel_sd_eval: 0.012,
  mf33: true,
  driver_dataset: "10003002",
  driver_effect: mlr / 3,
  support_points: Math.round(n * 0.8),
  support_datasets: ds - 1,
  comparator: "B-VIII.1-point-293.6K",
  lab: { target, reaction, mt, emin: e / 3, emax: e * 3, releases: ["B-VIII.1", "JEFF-3.3", "JENDL-5"] },
})

export const SAMPLE_LIST: SweepList = {
  release: "B-VIII.1",
  total: 6,
  page: 1,
  rows: [
    pair("U-235", 92235, 18, "N,F", 6.2, 0.041, 1840, 21, 1.2e4),
    pair("Pu-239", 94239, 18, "N,F", 4.8, -0.033, 1220, 17, 3.1e5),
    pair("Fe-56", 26056, 102, "N,G", 4.1, 0.12, 410, 9, 2.4e4),
    pair("Au-197", 79197, 102, "N,G", 3.3, -0.021, 2030, 33, 5.6e3),
    pair("Zr-90", 40090, 16, "N,2N", 2.9, 0.08, 96, 6, 1.5e7),
    pair("Cu-63", 29063, 107, "N,A", 2.1, -0.15, 58, 4, 1.4e7),
  ],
}

export const SAMPLE_RELEASES: SweepReleases = {
  releases: ["B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"].map((release) => ({ release, sublibraries: ["neutrons", "protons"], pairs: null })),
  run_date: null,
  method: null,
}

const bins = Array.from({ length: 12 }, (_, i) => {
  const lo = 10 ** (3 + i / 4)
  const hi = 10 ** (3 + (i + 1) / 4)
  return { e_lo: lo, e_hi: hi, e_mid: Math.sqrt(lo * hi), mean_log_ratio: 0.04 * Math.sin(i / 2), se: 0.01, n_points: 40, n_datasets: 5, rel_sd_eval: 0.012 }
})

export const SAMPLE_PAIR: SweepPair = {
  target: "U-235",
  mt: 18,
  sub: "neutrons",
  reaction: "N,F",
  releases: [
    {
      release: "B-VIII.1",
      bins,
      datasets: ["10003002", "20826003", "30001002"].map((dataset, k) => ({
        dataset,
        author: ["Sample A", "Sample B", "Sample C"][k],
        year: 1970 + k * 15,
        n: 120,
        mean_log_ratio: 0.03 * (k - 1),
        se: 0.012,
        e_min: 1e3,
        e_max: 1e6,
        points: bins.map((b, i) => [b.e_mid * (1 + k * 0.05), Math.exp(0.04 * Math.sin(i / 2) + 0.03 * (k - 1))] as [number, number]),
      })),
    },
  ],
  lab: null,
}

export const SAMPLE_RETRO: SweepRetro = {
  summary: {
    base_rate: 0.18,
    top: [10, 20, 50, 100, 200].map((n, i) => ({ n, hit_rate: 0.6 - i * 0.08, enrichment: (0.6 - i * 0.08) / 0.18, toward: 0.7 })),
    changed_median_rank: 140,
    all_toward: null,
    from: "B-VIII.0",
    to: "B-VIII.1",
    method: "",
  },
  pairs: [],
  rows: SAMPLE_LIST.rows.map((r, i) => ({ rank: i + 1, target: r.target, mt: r.mt, reaction: r.reaction, sublibrary: r.sublibrary, z: r.z, mean_log_ratio_v80: (r.mean_log_ratio ?? 0) * 1.4, mean_log_ratio_v81: r.mean_log_ratio, changed: i % 2 === 0, rms_log: i % 2 === 0 ? 0.012 : 0.001, moved_toward_data: i % 2 === 0 ? true : null })),
}

export const SAMPLE_FLAGS: SweepFlags = {
  evaluation: SAMPLE_LIST.rows.slice(0, 3).map((r) => ({ target: r.target, mt: r.mt, reaction: r.reaction, sublibrary: r.sublibrary, z: r.z, datasets: [{ subentry: "10003002", author: "Sample A", year: 1970 }], max_bin_dev: r.max_bin_dev, max_bin_e_ev: r.max_bin_e_ev, rel_sd_eval: r.rel_sd_eval, mf33: r.mf33 })),
  exfor: [
    { rule: "a", subentry: "10003002", entry: "10003", author: "Sample A", year: 1970, target: "U-235", mt: 18, reaction: "N,F", note: "units MB read as B", nsr_key: null, reference: "" },
    { rule: "b", subentry: "20826003", entry: "20826", author: "Sample B", year: 1985, target: "Fe-56", mt: 102, reaction: "N,G", note: "median ratio 1000 to every evaluation", nsr_key: null, reference: "" },
  ],
  publicLists: [],
}
