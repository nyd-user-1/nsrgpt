-- exfor_serve_search_index: one row per dataset (a subentry's REACTION record: subentry + pointer; one per subentry
-- for the 9 in 10 subentries with a single reaction), every field the EXFOR search form filters on.
-- Source: J4 2026-10-28 (exfor_j4_*), the dictionary (exfor_dict_*), C5 (exfor_c5_datasets).
-- Energy min and max are incident energies in eV: the points' own range where exfor_serve_points holds the dataset
-- (brief 70 follow-up), else (dictionary 24 families A and C) from DATA columns and COMMON values
-- (the subentry's own and its entry's subentry 001) whose pointer is blank or the dataset's, times dictionary 25's
-- factor for the unit. Only dictionary 25 energy units (family E) with a fixed factor count: per-nucleon units
-- (MEV/A, GEV/A) and temperatures (KT in K) are left out, and so are *-DUMMY headings.
-- Built with UNLOAD (workgroup nsrgpt enforces its output location, so CTAS with external_location is refused),
-- then registered as nsr.exfor_serve_search_index from the Parquet schema (scripts/parse/serve/serve.py).
UNLOAD (
WITH u AS (SELECT code, unit_conversion_factor AS f FROM exfor_dict_data_units
           WHERE unit_conversion_factor IS NOT NULL AND additional_code = 'E'),
rec AS (
  SELECT entry, subent, pointer, reaction_no, max(unit_no) AS units,
         max_by(code, -unit_no) AS code, max_by(unit_combination, -unit_no) AS unit_combination,
         max_by(target, -unit_no) AS target, max_by(target_za, -unit_no) AS target_za,
         max_by(target_state, -unit_no) AS target_state, max_by(projectile, -unit_no) AS projectile,
         max_by(projectile_za, -unit_no) AS projectile_za, max_by(process, -unit_no) AS process,
         max_by(product, -unit_no) AS product, max_by(product_za, -unit_no) AS product_za,
         max_by(quantity, -unit_no) AS quantity, max_by(data_type, -unit_no) AS data_type,
         array_agg(DISTINCT target) AS targets
  FROM exfor_j4_reactions GROUP BY entry, subent, pointer, reaction_no),
ev AS (
  SELECT p.subent, p.pointer, p.value * u.f AS ev FROM exfor_j4_data_points p JOIN u ON u.code = p.unit
  WHERE p.role = 'en' AND p.value IS NOT NULL AND p.name NOT LIKE '%DUMMY'
  UNION ALL
  SELECT c.subent, c.pointer, c.value * u.f FROM exfor_j4_data_columns c JOIN u ON u.code = c.unit
  WHERE c.section = 'COMMON' AND c.role = 'en' AND c.value IS NOT NULL AND c.name NOT LIKE '%DUMMY'
  UNION ALL
  SELECT s.subent, c.pointer, c.value * u.f FROM exfor_j4_data_columns c JOIN u ON u.code = c.unit
  JOIN exfor_j4_subentries s ON s.entry = c.entry AND s.subent <> c.subent
  WHERE c.subent LIKE '%001' AND c.section = 'COMMON' AND c.role = 'en' AND c.value IS NOT NULL
    AND c.name NOT LIKE '%DUMMY'),
ev_ptr AS (SELECT subent, pointer, min(ev) AS emin, max(ev) AS emax FROM ev GROUP BY 1, 2),
rng AS (
  SELECT r.subent, r.pointer, min(e.emin) AS energy_min_ev, max(e.emax) AS energy_max_ev
  FROM rec r JOIN ev_ptr e ON e.subent = r.subent AND (e.pointer = '' OR e.pointer = r.pointer)
  GROUP BY 1, 2),
c5 AS (SELECT DISTINCT dataset FROM exfor_c5_datasets),
-- brief 70 follow-up (elpis-fill, 2026-11-11): where a dataset has points in exfor_serve_points, its range is theirs
-- (2026-11-11: 9,378 ranges differed from the points by more than 1%, 1,959 did not overlap them, 18,764 were empty)
pts AS (SELECT dataset, min(e_ev) AS pmin, max(e_ev) AS pmax FROM exfor_serve_points WHERE e_ev > 0 GROUP BY dataset)
SELECT r.subent || r.pointer AS dataset, r.entry, r.subent, r.pointer, r.code,
       r.units, r.unit_combination, r.targets,
       r.target, regexp_replace(r.target, '^[0-9]+-', '') AS target_sym, r.target_za, r.target_state,
       CAST(r.target_za / 1000 AS integer) AS target_z, r.projectile, r.projectile_za, r.process,
       r.projectile || ',' || r.process AS reaction, r.product, r.product_za, r.quantity,
       split_part(r.quantity, ',', 1) AS sf5, split_part(r.quantity, ',', 2) AS sf6,
       split_part(r.quantity, ',', 3) AS sf7, split_part(r.quantity, ',', 4) AS sf8, r.data_type,
       coalesce(pts.pmin, g.energy_min_ev) AS energy_min_ev, coalesce(pts.pmax, g.energy_max_ev) AS energy_max_ev,
       e.year, element_at(e.authors, 1) AS first_author, cardinality(e.authors) AS n_authors,
       element_at(e.institute, 1) AS institute, element_at(e."references", 1) AS reference, e.title,
       s.n_data_rows AS points, s.n_data_cols AS columns, s.date AS subentry_date, e.date AS entry_date,
       c5.dataset IS NOT NULL AS has_c5
FROM rec r
JOIN exfor_j4_subentries s ON s.subent = r.subent
JOIN exfor_j4_entries e ON e.entry = r.entry
LEFT JOIN rng g ON g.subent = r.subent AND g.pointer = r.pointer
LEFT JOIN c5 ON c5.dataset = r.subent || r.pointer
LEFT JOIN pts ON pts.dataset = r.subent || r.pointer
) TO 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/search_index/'
WITH (format = 'PARQUET', compression = 'SNAPPY')
