-- search_docs_structure: parsing-1's share of the search documents (brief 18's columns): nuclides, adopted levels with a
-- half-life or an isomer flag, decays, ENSDF and XUNDL datasets, ENDF materials and MF3 cross sections, all releases
-- (ENDF/B, JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2; @LIB@ names the library, @FAMILY@ its bare name for a lone "JEFF").
-- url_path is the nsr-api path that returns the record.
UNLOAD (
WITH el AS (SELECT * FROM @ELEMENTS@),
s AS (SELECT s.*, el.ename FROM nuclide_serve_summary s LEFT JOIN el ON el.z = s.z),
lv AS (SELECT l.*, regexp_extract(l.name, '[A-Za-z]+$') AS sym, lower(l.ms) AS m FROM nuclide_serve_levels l
       WHERE l.level_seq > 1 AND (l.ms IS NOT NULL OR l.half_life_s IS NOT NULL)),
dsets AS (
  SELECT 'ENSDF' AS lib, 'ensdf' AS pre, dataset_seq, nucid, z, a, element, dsid, dstype, dsref, publication, date
  FROM ensdf_datasets
  UNION ALL
  SELECT 'XUNDL', 'xundl', dataset_seq, nucid, z, a, element, dsid, dstype, dsref, publication, date FROM xundl_datasets),
mt AS (SELECT * FROM endf_serve_mt_names)
SELECT 'nuclide' AS type, s.name AS id, s.name,
       coalesce(@CAP(s.ename)@, s.symbol) || '-' || CAST(s.a AS varchar) || ' (' || s.symbol || '-' || CAST(s.a AS varchar) || '): Z='
         || CAST(s.z AS varchar) || ', N=' || CAST(s.n AS varchar) || coalesce(', half-life ' || s.half_life_text, '')
         || coalesce(', decay ' || nullif(array_join(regexp_extract_all(s.decay_modes, '"mode":"([^"]*)"', 1), ', '), ''), '')
         AS title,
       concat_ws(' ', s.name, s.symbol || '-' || CAST(s.a AS varchar), s.symbol || CAST(s.a AS varchar),
                 s.ename || '-' || CAST(s.a AS varchar), s.ename, 'Z=' || CAST(s.z AS varchar), 'N=' || CAST(s.n AS varchar),
                 'A=' || CAST(s.a AS varchar), s.half_life_text, s.jpi_ground,
                 array_join(regexp_extract_all(s.decay_modes, '"mode":"([^"]*)"', 1), ' '),
                 'nuclide levels gammas decay half-life') AS text,
       filter(ARRAY[s.name, s.symbol || '-' || CAST(s.a AS varchar), s.ename, s.symbol], x -> x IS NOT NULL) AS keywords,
       'ENSDF 2026-11-05' AS dataset, s.z, s.a, CAST(NULL AS integer) AS mt, CAST(NULL AS integer) AS year,
       '/nuclide/' || s.name AS url_path
FROM s
UNION ALL
SELECT 'level', lv.name || ':' || CAST(lv.level_seq AS varchar),
       coalesce(CAST(lv.a AS varchar) || lv.m || lv.sym, lv.name) || ' ' || coalesce(lv.energy_text, '') || ' keV',
       lv.sym || '-' || CAST(lv.a AS varchar) || coalesce(' (' || lv.sym || '-' || CAST(lv.a AS varchar) || lv.m || ')', '')
         || ' level at ' || coalesce(lv.energy_text, '?') || ' keV' || coalesce(', J-pi ' || lv.jpi, '')
         || coalesce(', half-life ' || lv.half_life_text, ''),
       concat_ws(' ', lv.name, lv.sym || '-' || CAST(lv.a AS varchar), CAST(lv.a AS varchar) || lv.m || lv.sym,
                 lv.sym || '-' || CAST(lv.a AS varchar) || lv.m, lv.energy_text, 'keV', lv.jpi, lv.half_life_text,
                 lv.decay_modes_text, CASE WHEN lv.m IS NOT NULL THEN 'isomer metastable' END, 'level excited state'),
       filter(ARRAY[lv.name, CAST(lv.a AS varchar) || lv.m || lv.sym, lv.sym || '-' || CAST(lv.a AS varchar) || lv.m],
              x -> x IS NOT NULL),
       'ENSDF 2026-11-05', lv.z, lv.a, CAST(NULL AS integer), CAST(NULL AS integer), '/nuclide/' || lv.name || '/levels'
FROM lv
UNION ALL
SELECT 'decay', 'decay:' || CAST(d.dataset_seq AS varchar), d.parent || ' ' || d.mode || ' decay',
       @ALT(d.parent)@ || ' ' || d.mode || ' decay to ' || @ALT(d.daughter)@
         || coalesce(', half-life ' || d.half_life_text, '') || coalesce(', Q ' || CAST(d.q_kev AS varchar) || ' keV', '')
         || coalesce(', branching ' || CAST(d.branching_pct AS varchar) || '%', ''),
       concat_ws(' ', d.parent, @ALT(d.parent)@, replace(@ALT(d.parent)@, '-', ''), d.daughter, @ALT(d.daughter)@,
                 d.mode, @MODE_WORDS(d.mode)@, d.dsid, d.half_life_text, 'decay radioactive'),
       filter(ARRAY[d.parent, @ALT(d.parent)@, d.daughter, d.mode], x -> x IS NOT NULL),
       'ENSDF 2026-11-05', d.parent_z, d.parent_a, CAST(NULL AS integer), CAST(NULL AS integer), '/nuclide/' || d.parent
FROM nuclide_serve_decays d WHERE d.parent IS NOT NULL
UNION ALL
SELECT 'dataset', ds.pre || ':' || CAST(ds.dataset_seq AS varchar),
       coalesce(CAST(ds.a AS varchar) || @SYM(ds.element)@, ds.nucid) || ': ' || ds.dsid,
       ds.dsid || ' (' || ds.lib || coalesce(', ' || nullif(trim(ds.publication), ''), '') || coalesce(', ' || ds.date, '') || ')',
       concat_ws(' ', CAST(ds.a AS varchar) || @SYM(ds.element)@, @SYM(ds.element)@ || '-' || CAST(ds.a AS varchar),
                 'A=' || CAST(ds.a AS varchar), ds.dsid, ds.dstype, ds.dsref, ds.publication, ds.lib, 'dataset'),
       filter(ARRAY[CAST(ds.a AS varchar) || @SYM(ds.element)@, ds.lib, ds.dstype], x -> x IS NOT NULL),
       ds.lib || CASE WHEN ds.lib = 'ENSDF' THEN ' 2026-11-05' ELSE ' 2026-10-01' END, ds.z, ds.a, CAST(NULL AS integer),
       try_cast(substr(ds.date, 1, 4) AS integer),
       CASE WHEN ds.z IS NOT NULL AND ds.a IS NOT NULL THEN '/nuclide/' || CAST(ds.a AS varchar) || @SYM(ds.element)@ END
FROM dsets ds
UNION ALL
SELECT 'material', m.release || '/' || m.sublibrary || '/' || CAST(m.mat AS varchar), m.name,
       m.name || ', ' || @LIB(m.release)@ || ' ' || m.sublibrary || ', MAT ' || CAST(m.mat AS varchar)
         || coalesce(', ' || nullif(m.lab, ''), ''),
       concat_ws(' ', m.name, replace(m.name, '-', ''), m.zsymam, @LIB(m.release)@, m.release, m.sublibrary,
                 @SUB_WORDS(m.sublibrary)@, 'MAT ' || CAST(m.mat AS varchar), 'MAT' || CAST(m.mat AS varchar),
                 nullif(m.lab, ''), nullif(m.authors, ''), nullif(m.edate, ''), 'evaluated material', @FAMILY(m.release)@),
       filter(ARRAY[m.name, @LIB(m.release)@, m.sublibrary], x -> x IS NOT NULL),
       @LIB(m.release)@, m.z, m.a, CAST(NULL AS integer), CAST(NULL AS integer),
       '/endf/materials?release=' || m.release || '&sublibrary=' || m.sublibrary || '&z=' || CAST(m.z AS varchar)
FROM endf_serve_materials m WHERE m.release NOT LIKE '%-point-%'
UNION ALL
SELECT 'cross_section', x.release || '/' || x.sublibrary || '/' || CAST(x.mat AS varchar) || '/' || CAST(x.mt AS varchar),
       x.name || ' ' || coalesce(replace(t.reaction, '(z,', '(' || @PROJ(x.sublibrary)@ || ','), 'MT ' || CAST(x.mt AS varchar)),
       x.name || ' ' || coalesce(t.name, 'MT ' || CAST(x.mt AS varchar)) || ' cross section, MT ' || CAST(x.mt AS varchar)
         || ', ' || @LIB(x.release)@ || ' ' || x.sublibrary,
       concat_ws(' ', x.name, replace(x.name, '-', ''), replace(t.reaction, '(z,', '(' || @PROJ(x.sublibrary)@ || ','),
                 t.name, 'MT' || CAST(x.mt AS varchar), 'MT ' || CAST(x.mt AS varchar), 'cross section',
                 @LIB(x.release)@, @FAMILY(x.release)@, x.release, x.sublibrary, @SUB_WORDS(x.sublibrary)@),
       filter(ARRAY[x.name, replace(t.reaction, '(z,', '(' || @PROJ(x.sublibrary)@ || ','), 'MT' || CAST(x.mt AS varchar)],
              y -> y IS NOT NULL),
       @LIB(x.release)@, x.z, x.a, x.mt, CAST(NULL AS integer),
       '/endf/xs?name=' || x.name || '&mt=' || CAST(x.mt AS varchar) || '&release=' || x.release || '&sub=' || x.sublibrary
FROM endf_serve_xs x LEFT JOIN mt t ON t.mt = x.mt WHERE x.release NOT LIKE '%-point-%'
) TO '@LOC@' WITH (format = 'PARQUET', compression = 'SNAPPY')
