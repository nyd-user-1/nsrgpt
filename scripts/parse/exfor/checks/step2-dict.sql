-- Dictionary 8 code shape
SELECT code, description FROM exfor_dict_elements ORDER BY code LIMIT 5;

-- Processes that are not one dictionary 30 or 33 code (most common)
SELECT r.process, count(*) AS n FROM exfor_j4_reactions r
LEFT JOIN exfor_dict_processes p ON p.code = r.process
LEFT JOIN exfor_dict_particles pt ON pt.code = regexp_replace(r.process, '^[0-9]+', '')
WHERE p.code IS NULL AND pt.code IS NULL GROUP BY 1 ORDER BY n DESC LIMIT 12;

-- Processes whose every "+"-separated part (multiplicity stripped) is a dictionary 30 or 33 code
WITH parts AS (
  SELECT r.subent, r.reaction_no, r.unit_no, t.part FROM exfor_j4_reactions r
  CROSS JOIN UNNEST(split(r.process, '+')) AS t(part) WHERE r.process IS NOT NULL),
checked AS (
  SELECT p.subent, p.reaction_no, p.unit_no, (d30.code IS NOT NULL OR d33.code IS NOT NULL) AS ok FROM parts p
  LEFT JOIN exfor_dict_processes d30 ON d30.code = p.part
  LEFT JOIN exfor_dict_particles d33 ON d33.code = regexp_replace(p.part, '^[0-9]+', ''))
SELECT count(*) AS units, count_if(all_ok) AS all_parts_in_dict FROM (
  SELECT subent, reaction_no, unit_no, bool_and(ok) AS all_ok FROM checked GROUP BY 1, 2, 3)
