-- J4 counts against the reference (27,116 entries; 223,615 subentries; 88,813 reaction codes; 19,439,354 data rows; 76.5 M values)
SELECT (SELECT count(*) FROM exfor_j4_entries) AS entries, (SELECT count(*) FROM exfor_j4_subentries) AS subentries,
       (SELECT count(DISTINCT code) FROM exfor_j4_reactions) AS reaction_codes,
       (SELECT sum(n_data_rows) FROM exfor_j4_subentries) AS data_rows,
       (SELECT count(*) FROM exfor_j4_data_points) AS data_values;

-- Data rows: distinct (subent, row) in data_points equals the sum of N2
SELECT count(*) AS rows_in_points FROM (SELECT DISTINCT subent, "row" FROM exfor_j4_data_points);

-- 50 random subentries with data in both: X4Pro 2023-07-14 DnRow against J4 N2 (J4 date shows later revisions)
SELECT x.subacc, x.dnrow AS x4pro_rows, j.n_data_rows AS j4_rows, x.dnrow = j.n_data_rows AS same,
       j.date AS j4_date, date_format(x.dateupd, '%Y%m%d') AS x4pro_date
FROM exfor_subent x JOIN exfor_j4_subentries j ON j.subent = x.subacc
WHERE x.dnrow > 0 ORDER BY rand() LIMIT 50;

-- The same over every shared subentry with data
SELECT count(*) AS shared, count(*) FILTER (WHERE x.dnrow = j.n_data_rows) AS same_rows,
       count(*) FILTER (WHERE x.dnrow <> j.n_data_rows AND j.date > 20230714) AS differ_revised_after_build,
       count(*) FILTER (WHERE x.dnrow <> j.n_data_rows AND j.date <= 20230714) AS differ_not_revised
FROM exfor_subent x JOIN exfor_j4_subentries j ON j.subent = x.subacc WHERE x.dnrow > 0 OR j.n_data_rows > 0;

-- Reaction parse against the dictionary: share of reaction units whose parts are dictionary codes
SELECT count(*) AS units,
       count(*) FILTER (WHERE p.code IS NOT NULL OR pt.code IS NOT NULL) AS process_in_dict30_or_33,
       count(*) FILTER (WHERE q.code IS NOT NULL) AS quantity_in_dict236,
       count(*) FILTER (WHERE e.code IS NOT NULL) AS target_element_in_dict8,
       count(*) FILTER (WHERE r.process IS NULL) AS no_process
FROM exfor_j4_reactions r
LEFT JOIN exfor_dict_processes p ON p.code = r.process
LEFT JOIN exfor_dict_particles pt ON pt.code = regexp_replace(r.process, '^[0-9]+', '')
LEFT JOIN exfor_dict_quantities q ON q.code = r.quantity_236
LEFT JOIN exfor_dict_elements e ON e.code = regexp_extract(r.target, '^([0-9]+-[A-Z]+)', 1);

-- Units whose quantity is not in dictionary 236 (most common)
SELECT r.quantity_236, count(*) AS n FROM exfor_j4_reactions r LEFT JOIN exfor_dict_quantities q
  ON q.code = r.quantity_236 WHERE q.code IS NULL GROUP BY 1 ORDER BY n DESC LIMIT 15
