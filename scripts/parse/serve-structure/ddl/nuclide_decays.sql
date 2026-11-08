-- nuclide_serve_decays: one row per ENSDF decay dataset. The dataset's NUCID is the daughter; the parent, its level,
-- half-life and Q come from the first P record (the DSID's first word when there is none); branching_pct is the N
-- record's BR times 100.
UNLOAD (
WITH @NUC@,
dec AS (SELECT dataset_seq, nucid, dsid, gamma_count FROM ensdf_datasets WHERE dstype = 'decay'),
p AS (SELECT dataset_seq, nucid, energy_kev, jpi, half_life, half_life_unit, half_life_raw, half_life_unc_raw, qp, qp_unc,
             row_number() OVER (PARTITION BY dataset_seq ORDER BY card_seq) AS rn,
             count(*) OVER (PARTITION BY dataset_seq) AS n_parents
      FROM ensdf_parents),
nr AS (SELECT dataset_seq, br, br_unc, row_number() OVER (PARTITION BY dataset_seq ORDER BY card_seq) AS rn
       FROM ensdf_normalization WHERE kind = 'N')
SELECT CAST(pn.a AS varchar) || pn.sym AS parent, pn.z AS parent_z, pn.a AS parent_a,
       CAST(dn.a AS varchar) || dn.sym AS daughter, dn.z AS daughter_z, dn.a AS daughter_a,
       regexp_extract(d.dsid, '^\S+\s+(.+?)\s+DECAY', 1) AS mode, d.dsid,
       p.energy_kev AS parent_level_kev, p.jpi AS parent_jpi,
       @HL_S(p.half_life, p.half_life_unit)@ AS half_life_s,
       nullif(trim(coalesce(p.half_life_raw, '') || ' ' || coalesce(p.half_life_unc_raw, '')), '') AS half_life_text,
       p.qp AS q_kev, p.qp_unc AS q_unc_kev, nr.br * 100 AS branching_pct, nr.br_unc * 100 AS branching_unc_pct,
       d.gamma_count AS n_gammas, coalesce(p.n_parents, 0) AS n_parents, d.dataset_seq
FROM dec d
JOIN nuc dn ON dn.nucid = d.nucid
LEFT JOIN p ON p.dataset_seq = d.dataset_seq AND p.rn = 1
LEFT JOIN nuc pn ON pn.nucid = coalesce(p.nucid, regexp_extract(d.dsid, '^(\S+)', 1))
LEFT JOIN nr ON nr.dataset_seq = d.dataset_seq AND nr.rn = 1
ORDER BY pn.z, pn.a, dn.z, d.dataset_seq
) TO '@LOC@' WITH (format = 'PARQUET', compression = 'SNAPPY')
