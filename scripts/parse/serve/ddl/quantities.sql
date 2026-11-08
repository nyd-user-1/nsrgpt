-- exfor_serve_quantities: the quantity picker, one row per REACTION quantity (SF5-SF8, as in dictionary 236), with
-- its dictionary description, SF6 parameter (the code the form's Quantity field takes, e.g. SIG) and counts.
-- Built with UNLOAD (workgroup nsrgpt enforces its output location, so CTAS with external_location is refused),
-- then registered as nsr.exfor_serve_quantities from the Parquet schema (scripts/parse/serve/serve.py).
UNLOAD (
SELECT s.quantity, s.sf6, q.description, q.additional_code AS units_family, pm.description AS sf6_description,
       count(*) AS datasets, count(DISTINCT s.subent) AS subentries, count(DISTINCT s.entry) AS entries,
       count(DISTINCT s.target) AS targets
FROM exfor_serve_search_index s
LEFT JOIN exfor_dict_quantities q ON q.code = s.quantity
LEFT JOIN exfor_dict_parameters pm ON pm.code = s.sf6
WHERE s.quantity IS NOT NULL
GROUP BY s.quantity, s.sf6, q.description, q.additional_code, pm.description
) TO 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/quantities/'
WITH (format = 'PARQUET', compression = 'SNAPPY')
