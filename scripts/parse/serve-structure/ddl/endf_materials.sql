-- endf_serve_materials (release @R@): one row per material. sublibrary is NNDC's short folder name, read from NSUB
-- (MF1/451); the general-purpose tapes before ENDF-6 carry no NSUB and are neutron libraries. name is Sym-A (m for an
-- isomeric target, nat for A=0); thermal scattering materials keep their ZSYMAM, e.g. H(H2O).
UNLOAD (
WITH el AS (SELECT * FROM @ELEMENTS@),
m AS (SELECT *, CAST(floor(za / 1000) AS integer) AS z_, CAST(CAST(za AS bigint) % 1000 AS integer) AS a_
      FROM endfb_materials WHERE release = '@R@'),
s AS (SELECT file_name, mat, count(*) AS n_mf3_sections, sum(np) AS n_points
      FROM endfb_sections WHERE release = '@R@' AND mf = 3 GROUP BY file_name, mat)
SELECT m.release, @SUB(m.nsub)@ AS sublibrary, m.sublibrary AS folder, m.mat, m.za, m.z_ AS z, m.a_ AS a, m.liso,
       CASE WHEN m.nsub = 12 AND trim(m.zsymam) <> '' THEN trim(m.zsymam)
            ELSE coalesce(el.sym, CAST(m.z_ AS varchar)) || '-' || CASE WHEN m.a_ = 0 THEN 'nat' ELSE CAST(m.a_ AS varchar) END
                 || CASE WHEN m.liso = 1 THEN 'm' WHEN m.liso > 1 THEN 'm' || CAST(m.liso AS varchar) ELSE '' END END AS name,
       trim(m.zsymam) AS zsymam, m.awr, m.temp_k, m.nsub, m.lrp, m.file_name,
       coalesce(s.n_mf3_sections, 0) AS n_mf3_sections, coalesce(s.n_points, 0) AS n_points,
       trim(m.alab) AS lab, trim(m.edate) AS edate, trim(m.auth) AS authors
FROM m LEFT JOIN s ON s.file_name = m.file_name AND s.mat = m.mat
LEFT JOIN el ON el.z = m.z_
ORDER BY 2, m.z_, m.a_, m.liso, m.mat
) TO '@LOC@' WITH (format = 'PARQUET', compression = 'SNAPPY')
