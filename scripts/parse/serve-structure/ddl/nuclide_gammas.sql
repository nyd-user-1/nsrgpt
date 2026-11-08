-- nuclide_serve_gammas: the gammas of each ADOPTED LEVELS dataset. level_seq is the level the gamma leaves (the L
-- record it follows). final_level_seq is the lower level whose energy matches E(initial) - E(gamma) - recoil
-- (E^2 / 2 A mc^2) within max(3 sigma, @TOL@ keV), sigma combining the three uncertainties; null when no level or more
-- than one level matches.
UNLOAD (
WITH @NUC@, @ADOPTED@,
lv AS (SELECT l.dataset_seq, l.level_seq, l.energy_kev, l.energy_unc FROM ensdf_levels l
       JOIN adopted a ON a.dataset_seq = l.dataset_seq),
g AS (
  SELECT g.dataset_seq, g.card_seq, g.level_seq, g.e_gamma, g.e_gamma_raw, g.unc, g.ri, g.ri_unc, g.mult, g.mr, g.mr_unc,
         g.cc, g.cc_unc, g.ti, g.ti_unc, li.energy_kev AS ei, li.energy_unc AS ui, n.z, n.a, n.sym,
         li.energy_kev - g.e_gamma - g.e_gamma * g.e_gamma / (2.0 * n.a * 931494.10242) AS ef_pred
  FROM ensdf_gammas g JOIN adopted a ON a.dataset_seq = g.dataset_seq
  JOIN nuc n ON n.nucid = a.nucid
  LEFT JOIN lv li ON li.dataset_seq = g.dataset_seq AND li.level_seq = g.level_seq),
cand AS (
  SELECT g.dataset_seq, g.card_seq, lf.level_seq AS f_seq, lf.energy_kev AS ef, abs(lf.energy_kev - g.ef_pred) AS diff,
         greatest(3.0 * sqrt(power(coalesce(g.ui, 0), 2) + power(coalesce(g.unc, 0), 2)
                             + power(coalesce(lf.energy_unc, 0), 2)), @TOL@) AS tol
  FROM g JOIN lv lf ON lf.dataset_seq = g.dataset_seq AND lf.level_seq < g.level_seq
  WHERE g.ef_pred IS NOT NULL AND lf.energy_kev IS NOT NULL),
pick AS (SELECT dataset_seq, card_seq, count(*) AS n_cand, min_by(f_seq, diff) AS f_seq, min_by(ef, diff) AS ef
         FROM cand WHERE diff <= tol GROUP BY dataset_seq, card_seq)
SELECT g.z, g.a - g.z AS n, g.a, CAST(g.a AS varchar) || g.sym AS name, g.level_seq, g.ei AS level_energy_kev,
       CASE WHEN p.n_cand = 1 THEN p.f_seq END AS final_level_seq,
       CASE WHEN p.n_cand = 1 THEN p.ef END AS final_level_energy_kev,
       g.e_gamma AS e_gamma_kev, g.unc AS e_gamma_unc, g.e_gamma_raw AS e_gamma_text, g.ri, g.ri_unc, g.mult, g.mr,
       g.mr_unc, g.cc, g.cc_unc, g.ti, g.ti_unc
FROM g LEFT JOIN pick p ON p.dataset_seq = g.dataset_seq AND p.card_seq = g.card_seq
ORDER BY g.z, g.a, g.level_seq, g.e_gamma DESC
) TO '@LOC@' WITH (format = 'PARQUET', compression = 'SNAPPY')
