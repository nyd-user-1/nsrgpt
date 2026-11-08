-- Process codes (dictionary 30)
SELECT code, description FROM exfor_dict_processes ORDER BY code;

-- Particle codes (dictionary 33) used most as processes in J4
SELECT p.code, p.description, count(*) AS n FROM exfor_serve_search_index s JOIN exfor_dict_particles p ON p.code = s.process
GROUP BY 1, 2 ORDER BY n DESC LIMIT 15;

-- Most common SF6 parameters with descriptions
SELECT s.sf6, pm.description, count(*) AS n FROM exfor_serve_search_index s LEFT JOIN exfor_dict_parameters pm ON pm.code = s.sf6
GROUP BY 1, 2 ORDER BY n DESC LIMIT 15;

-- Elements: code shape and description
SELECT code, description FROM exfor_dict_elements WHERE code IN ('92-U', '27-CO', '55-CS', '26-FE')
