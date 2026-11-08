-- NSR: rows, is_nsr split, and the types of the columns the docs use
SELECT count(*) AS rows, count_if(is_nsr) AS is_nsr, min(pub_year) AS y0, max(pub_year) AS y1,
       typeof(any_value(authors)) AS authors_t, typeof(any_value(keywords)) AS keywords_t,
       typeof(any_value(nuclides)) AS nuclides_t, typeof(any_value(reactions)) AS reactions_t,
       typeof(any_value(pub_year)) AS year_t, typeof(any_value(is_nsr)) AS is_nsr_t
FROM nsr_parquet;

-- NSR: sample values
SELECT key_number, pub_year, substr(reference, 1, 60), substr(CAST(authors AS varchar), 1, 80),
       substr(title, 1, 60), substr(CAST(keywords AS varchar), 1, 120), substr(CAST(nuclides AS varchar), 1, 60),
       substr(CAST(reactions AS varchar), 1, 60)
FROM nsr_parquet WHERE key_number LIKE '2011JA%' LIMIT 4;

-- ENSDF and XUNDL datasets
SELECT 'ensdf' AS src, count(*) AS rows, count(DISTINCT nucid) AS nucids, max(release) AS release FROM ensdf_datasets
UNION ALL SELECT 'xundl', count(*), count(DISTINCT nucid), max(release) FROM xundl_datasets;

-- ENSDF dataset sample
SELECT release, nucid, a, element, z, dsid, dstype, dsref, publication, date FROM ensdf_datasets
WHERE nucid LIKE '60CO%' LIMIT 6;

-- ENDF/B materials and MF3 sections
SELECT count(*) AS materials FROM endfb_materials;

SELECT count(*) AS mf3_sections FROM endfb_sections WHERE mf = 3;

-- ENDF columns including partition keys
SELECT * FROM endfb_materials LIMIT 2
