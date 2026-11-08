-- nuclide_serve_levels: the levels of each nuclide's ADOPTED LEVELS dataset, in level order.
UNLOAD (
WITH @NUC@, @ADOPTED@,
l AS (SELECT l.*, a.nucid AS anucid, CAST(json_parse(coalesce(l.continuation, '{}')) AS map(varchar, varchar)) AS cm
      FROM ensdf_levels l JOIN adopted a ON a.dataset_seq = l.dataset_seq)
SELECT n.z, n.a - n.z AS n, n.a, CAST(n.a AS varchar) || n.sym AS name, l.level_seq, l.energy_kev,
       l.energy_kev_raw AS energy_text, l.energy_unc, l.jpi,
       @HL_S(l.half_life, l.half_life_unit)@ AS half_life_s,
       nullif(trim(coalesce(l.half_life_raw, '') || ' ' || coalesce(l.half_life_unc_raw, '')), '') AS half_life_text,
       @MODES_TEXT(l.cm)@ AS decay_modes_text, l.ms, l.band, l.flag
FROM l JOIN nuc n ON n.nucid = l.anucid
ORDER BY z, a, level_seq
) TO '@LOC@' WITH (format = 'PARQUET', compression = 'SNAPPY')
