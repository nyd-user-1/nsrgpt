-- X4Pro-only subentries by area, with how many of their entries J4 also holds
SELECT substr(x.subacc, 1, 1) AS area, count(*) AS x4pro_only, count(je.entry) AS entry_in_j4,
       min(x.subacc) AS first, max(x.subacc) AS last
FROM exfor_subent x LEFT JOIN exfor_j4_subentries j ON j.subent = x.subacc
LEFT JOIN exfor_j4_entries je ON je.entry = x.entry
WHERE j.subent IS NULL GROUP BY 1 ORDER BY 2 DESC;

-- Sample X4Pro-only subentries next to their entry's subentries in J4
SELECT x.subacc, length(x.subacc) AS len, x.entry, x.origsubent, x.dnrow,
       (SELECT count(*) FROM exfor_j4_subentries j2 WHERE j2.entry = x.entry) AS j4_subs_in_entry,
       (SELECT count(*) FROM exfor_subent x2 WHERE x2.entry = x.entry) AS x4_subs_in_entry
FROM exfor_subent x LEFT JOIN exfor_j4_subentries j ON j.subent = x.subacc
WHERE j.subent IS NULL ORDER BY rand() LIMIT 12;

-- J4 subentry id shapes
SELECT length(subent) AS len, count(*) AS n FROM exfor_j4_subentries GROUP BY 1;

-- X4Pro subentry id shapes
SELECT length(subacc) AS len, count(*) AS n FROM exfor_subent GROUP BY 1
