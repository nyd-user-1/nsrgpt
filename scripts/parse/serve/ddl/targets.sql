-- exfor_serve_targets: the target picker, one row per EXFOR target code with its dataset, subentry and entry counts.
-- Built with UNLOAD (workgroup nsrgpt enforces its output location, so CTAS with external_location is refused),
-- then registered as nsr.exfor_serve_targets from the Parquet schema (scripts/parse/serve/serve.py).
UNLOAD (
SELECT target, target_sym, target_za, target_z, target_state, e.description AS element,
       count(*) AS datasets, count(DISTINCT subent) AS subentries, count(DISTINCT entry) AS entries,
       sum(points) AS points
FROM exfor_serve_search_index s
LEFT JOIN exfor_dict_elements e ON e.code = regexp_extract(s.target, '^([0-9]+-[A-Z]+)', 1)
WHERE target IS NOT NULL
GROUP BY target, target_sym, target_za, target_z, target_state, e.description
) TO 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/targets/'
WITH (format = 'PARQUET', compression = 'SNAPPY')
