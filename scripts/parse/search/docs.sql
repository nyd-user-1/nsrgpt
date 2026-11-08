-- search_docs (brief 18): one row per searchable record, parsing-2's share. EXFOR datasets and entries, NSR references,
-- ENSDF and XUNDL datasets. parsing-1 writes nuclides, levels, decays and ENDF/B to docs_structure (same columns);
-- the index reads both, and drops these ENSDF and XUNDL rows if docs_structure carries its own. Built with UNLOAD
-- (workgroup nsrgpt refuses CTAS with a location), registered as nsr.search_docs from the Parquet schema
-- (scripts/parse/search/docs.py).
-- text holds what a person would type: ids, codes, symbols, element names, process and quantity words, authors, year.
-- Nuclide spellings (U-235, 235U, U235) are added at index time (index.py), so they are not repeated here.
UNLOAD (
WITH el AS (
  SELECT CAST(split_part(code, '-', 1) AS integer) AS z, description AS element FROM exfor_dict_elements),
proc AS (
  SELECT code, description FROM exfor_dict_processes
  UNION ALL
  SELECT code, description FROM exfor_dict_particles WHERE code NOT IN (SELECT code FROM exfor_dict_processes)),
ds AS (
  SELECT 'exfor_dataset' AS type, s.dataset AS id, s.code AS name, s.title,
    concat_ws(' ', 'EXFOR subentry', s.subent, 'entry', s.entry, 'dataset', s.dataset, s.code, s.target_sym, el.element,
      s.projectile, pj.description, s.process, pp.description,
      CASE s.process WHEN 'G' THEN 'capture radiative capture' WHEN 'F' THEN 'fission' WHEN 'EL' THEN 'elastic'
                     WHEN 'TOT' THEN 'total' WHEN 'INL' THEN 'inelastic' END,
      nullif(s.product, ''), s.quantity, qq.description, s.sf6, s.first_author, s.institute,
      CAST(s.year AS varchar), s.reference, CASE WHEN s.has_c5 THEN 'C5' END) AS text,
    filter(ARRAY[s.target_sym, s.reaction, s.sf6, nullif(s.product, '')], x -> x IS NOT NULL) AS keywords,
    'EXFOR' AS dataset, CAST(s.target_z AS integer) AS z, CAST(s.target_za % 1000 AS integer) AS a,
    CAST(NULL AS integer) AS mt, CAST(s.year AS integer) AS year, '/exfor/subentry/' || s.dataset AS url_path
  FROM exfor_serve_search_index s
  LEFT JOIN el ON el.z = s.target_z
  LEFT JOIN proc pp ON pp.code = s.process
  LEFT JOIN exfor_dict_particles pj ON pj.code = s.projectile
  LEFT JOIN exfor_dict_quantities qq ON qq.code = s.quantity),
codes AS (
  SELECT entry, array_join(slice(array_agg(DISTINCT code), 1, 40), ' ') AS codes,
         array_join(slice(array_agg(DISTINCT target_sym), 1, 40), ' ') AS targets
  FROM exfor_serve_search_index GROUP BY entry),
en AS (
  SELECT 'exfor_entry' AS type, e.entry AS id, 'EXFOR ' || e.entry AS name, e.title,
    concat_ws(' ', 'EXFOR entry', e.entry, e.title, array_join(e.authors, ' '), array_join(e.institute, ' '),
      CAST(e.year AS varchar), array_join(e."references", ' '), c.targets, c.codes) AS text,
    e.authors AS keywords, 'EXFOR' AS dataset, CAST(NULL AS integer) AS z, CAST(NULL AS integer) AS a,
    CAST(NULL AS integer) AS mt, CAST(e.year AS integer) AS year, '/exfor/search?acc=' || e.entry AS url_path
  FROM exfor_j4_entries e LEFT JOIN codes c ON c.entry = e.entry),
nsr AS (
  SELECT 'nsr' AS type, n.key_number AS id, n.key_number AS name, n.title,
    concat_ws(' ', 'NSR', n.key_number, n.reference, replace(n.authors, ';', ' '), CAST(n.pub_year AS varchar),
      n.title, n.keywords, translate(n.nuclides, '{}', '  '), translate(n.reactions, '{}"', '   ')) AS text,
    filter(split(regexp_replace(coalesce(n.nuclides, ''), '[{}]', ''), ','), x -> x <> '') AS keywords,
    'NSR' AS dataset, CAST(NULL AS integer) AS z, CAST(NULL AS integer) AS a, CAST(NULL AS integer) AS mt,
    CAST(n.pub_year AS integer) AS year, '/nsr/' || n.key_number AS url_path
  FROM nsr_parquet n WHERE n.is_nsr),
xu AS (
  SELECT 'xundl_dataset' AS type, trim(x.nucid) || ':' || x.dsid AS id, trim(x.nucid) || ' ' || x.dsid AS name,
    x.dsid AS title,
    concat_ws(' ', 'XUNDL dataset', trim(x.nucid), x.dsid, x.dstype, x.dsref, x.publication, CAST(x.date AS varchar),
      el.element) AS text,
    filter(ARRAY[trim(x.nucid), x.dstype], v -> v IS NOT NULL) AS keywords,
    'XUNDL' AS dataset, CAST(x.z AS integer) AS z, CAST(x.a AS integer) AS a, CAST(NULL AS integer) AS mt,
    TRY_CAST(substr(CAST(x.date AS varchar), 1, 4) AS integer) AS year,
    '/nuclide/' || CAST(x.a AS varchar) || upper(substr(x.element, 1, 1)) || lower(substr(x.element, 2)) AS url_path
  FROM xundl_datasets x LEFT JOIN el ON el.z = x.z),
es AS (
  SELECT 'ensdf_dataset' AS type, trim(x.nucid) || ':' || x.dsid AS id, trim(x.nucid) || ' ' || x.dsid AS name,
    x.dsid AS title,
    concat_ws(' ', 'ENSDF dataset', trim(x.nucid), x.dsid, x.dstype, x.dsref, x.publication, CAST(x.date AS varchar),
      el.element, CASE WHEN x.level_count > 0 THEN CAST(x.level_count AS varchar) || ' levels' END,
      CASE WHEN x.gamma_count > 0 THEN CAST(x.gamma_count AS varchar) || ' gammas' END) AS text,
    filter(ARRAY[trim(x.nucid), x.dstype], v -> v IS NOT NULL) AS keywords,
    'ENSDF' AS dataset, CAST(x.z AS integer) AS z, CAST(x.a AS integer) AS a, CAST(NULL AS integer) AS mt,
    TRY_CAST(substr(CAST(x.date AS varchar), 1, 4) AS integer) AS year,
    '/nuclide/' || CAST(x.a AS varchar) || upper(substr(x.element, 1, 1)) || lower(substr(x.element, 2)) AS url_path
  FROM ensdf_datasets x LEFT JOIN el ON el.z = x.z)
SELECT * FROM ds UNION ALL SELECT * FROM en UNION ALL SELECT * FROM nsr UNION ALL SELECT * FROM xu UNION ALL SELECT * FROM es
) TO 's3://nsr-lake-613473203863/lake/serve/search/2026-11-08/docs/'
WITH (format = 'PARQUET', compression = 'SNAPPY')
