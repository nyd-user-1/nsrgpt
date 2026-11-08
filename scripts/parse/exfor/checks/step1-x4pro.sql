-- Totals: X4Pro 2023-07-14 against J4 2026-10-28
SELECT (SELECT count(*) FROM exfor_entry) AS x4_entries, (SELECT count(*) FROM exfor_subent) AS x4_subentries,
       (SELECT count(*) FROM exfor_j4_entries) AS j4_entries, (SELECT count(*) FROM exfor_j4_subentries) AS j4_subentries;

-- Entries in one and not the other; J4-only entries split by whether J4 dates them after the X4Pro build
SELECT count(*) FILTER (WHERE x.entry IS NOT NULL AND j.entry IS NOT NULL) AS in_both,
       count(*) FILTER (WHERE x.entry IS NULL) AS j4_only,
       count(*) FILTER (WHERE x.entry IS NULL AND j.date > 20230714) AS j4_only_dated_after_build,
       count(*) FILTER (WHERE j.entry IS NULL) AS x4pro_only
FROM exfor_j4_entries j FULL OUTER JOIN exfor_entry x ON j.entry = x.entry;

-- Subentries in one and not the other
SELECT count(*) FILTER (WHERE x.subacc IS NOT NULL AND j.subent IS NOT NULL) AS in_both,
       count(*) FILTER (WHERE x.subacc IS NULL) AS j4_only,
       count(*) FILTER (WHERE x.subacc IS NULL AND j.date > 20230714) AS j4_only_dated_after_build,
       count(*) FILTER (WHERE x.subacc IS NULL AND jx.entry IS NULL) AS j4_only_in_entries_new_to_j4,
       count(*) FILTER (WHERE j.subent IS NULL) AS x4pro_only
FROM exfor_j4_subentries j FULL OUTER JOIN exfor_subent x ON j.subent = x.subacc
LEFT JOIN exfor_entry jx ON jx.entry = j.entry;

-- Entries by area
SELECT coalesce(j.area, x.area) AS area, count(j.entry) AS j4, count(x.entry) AS x4pro
FROM exfor_j4_entries j FULL OUTER JOIN exfor_entry x ON j.entry = x.entry GROUP BY 1 ORDER BY 1;

-- X4Pro entries J4 doesn't hold (sample)
SELECT x.entry, x.area, x.datedebut, x.author1, x.yearref1 FROM exfor_entry x LEFT JOIN exfor_j4_entries j
  ON j.entry = x.entry WHERE j.entry IS NULL ORDER BY x.entry LIMIT 20
