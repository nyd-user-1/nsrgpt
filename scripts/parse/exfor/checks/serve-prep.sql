-- Energy units used by incident-energy columns, with dictionary 25's factor and family
SELECT p.unit, u.unit_conversion_factor, u.additional_code, u.description, count(*) AS n
FROM exfor_j4_data_columns p LEFT JOIN exfor_dict_data_units u ON u.code = p.unit
WHERE p.role = 'en' GROUP BY 1, 2, 3, 4 ORDER BY n DESC LIMIT 25;

-- Incident-energy headings
SELECT name, count(*) AS n FROM exfor_j4_data_columns WHERE role = 'en' GROUP BY 1 ORDER BY n DESC LIMIT 20;

-- C5 dataset ids next to J4 subentry + pointer
SELECT d.dataset, d.subent_hdr, d.reaction FROM exfor_c5_datasets d WHERE length(d.dataset) > 8 LIMIT 5;

-- Datasets per subentry (reaction records with distinct pointers)
SELECT n, count(*) AS subentries FROM (SELECT subent, count(DISTINCT pointer) AS n FROM exfor_j4_reactions GROUP BY 1)
GROUP BY 1 ORDER BY 1
