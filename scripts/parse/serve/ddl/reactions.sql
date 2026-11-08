-- exfor_serve_reactions: the reaction picker, one row per projectile and process (as "N,F"), with counts.
-- Built with UNLOAD (workgroup nsrgpt enforces its output location, so CTAS with external_location is refused),
-- then registered as nsr.exfor_serve_reactions from the Parquet schema (scripts/parse/serve/serve.py).
UNLOAD (
SELECT reaction, projectile, process, p.description AS projectile_name,
       count(*) AS datasets, count(DISTINCT subent) AS subentries, count(DISTINCT entry) AS entries,
       count(DISTINCT target) AS targets
FROM exfor_serve_search_index s
LEFT JOIN exfor_dict_particles p ON p.code = s.projectile
WHERE reaction IS NOT NULL
GROUP BY reaction, projectile, process, p.description
) TO 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/reactions/'
WITH (format = 'PARQUET', compression = 'SNAPPY')
