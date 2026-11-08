-- nuclide_serve_summary: one row per nuclide ENSDF 2026-11-05 knows (every NUCID with an element). Half-life, J-pi and
-- decay modes come from the ground state of the nuclide's ADOPTED LEVELS dataset; Q-values from its Q record (ENSDF
-- carries no mass excess). Placeholders (@NUC@, @ADOPTED@, @HL_S()@, @MODES()@, @LOC@) are filled by serve.py.
UNLOAD (
WITH @NUC@, @ADOPTED@,
ds AS (SELECT nucid, count(*) AS n_datasets FROM ensdf_datasets GROUP BY nucid),
xu AS (SELECT DISTINCT nucid FROM xundl_datasets),
ad AS (SELECT a.nucid, d.dataset_seq, d.dsid, d.level_count, d.gamma_count
       FROM adopted a JOIN ensdf_datasets d ON d.dataset_seq = a.dataset_seq),
ground AS (
  SELECT l.dataset_seq, l.jpi, l.half_life, l.half_life_unit, l.half_life_raw, l.half_life_unc_raw, l.continuation,
         row_number() OVER (PARTITION BY l.dataset_seq ORDER BY CASE WHEN l.energy_kev = 0 THEN 0 ELSE 1 END, l.level_seq) AS rn
  FROM ensdf_levels l JOIN adopted a ON a.dataset_seq = l.dataset_seq),
g AS (SELECT *, CAST(json_parse(coalesce(continuation, '{}')) AS map(varchar, varchar)) AS cm FROM ground WHERE rn = 1),
q AS (SELECT dataset_seq, q_minus, sn, sp, qa, row_number() OVER (PARTITION BY dataset_seq ORDER BY card_seq) AS rn
      FROM ensdf_qvalues)
SELECT n.z, n.a - n.z AS n, n.a, n.sym AS symbol, CAST(n.a AS varchar) || n.sym AS name, n.nucid,
       @HL_S(g.half_life, g.half_life_unit)@ AS half_life_s,
       nullif(trim(coalesce(g.half_life_raw, '') || ' ' || coalesce(g.half_life_unc_raw, '')), '') AS half_life_text,
       @MODES(g.cm)@ AS decay_modes,
       ad.level_count AS n_levels, ad.gamma_count AS n_gammas, coalesce(ds.n_datasets, 0) AS n_datasets,
       xu.nucid IS NOT NULL AS has_xundl, ad.dsid AS adopted_dsid, g.jpi AS jpi_ground,
       q.q_minus AS q_minus_kev, q.sn AS sn_kev, q.sp AS sp_kev, q.qa AS qa_kev
FROM nuc n
LEFT JOIN ds ON ds.nucid = n.nucid
LEFT JOIN xu ON xu.nucid = n.nucid
LEFT JOIN ad ON ad.nucid = n.nucid
LEFT JOIN g ON g.dataset_seq = ad.dataset_seq
LEFT JOIN q ON q.dataset_seq = ad.dataset_seq AND q.rn = 1
ORDER BY z, a
) TO '@LOC@' WITH (format = 'PARQUET', compression = 'SNAPPY')
