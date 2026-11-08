-- endf_serve_xs (release @R@): one row per MF3 cross section, the chart row. energy_ev and xs_barn are the section's
-- points in order (parallel arrays); interp_nbt and interp_law are the TAB1 interpolation regions (last point of each
-- region and its ENDF law: 1 histogram, 2 lin-lin, 3 lin-log, 4 log-lin, 5 log-log). Every point is served here
-- (n_served = n_points, thinned false); the POINT releases are built by serve.py endf_point, thinned for charts.
UNLOAD (
WITH m AS (SELECT file_name, mat, sublibrary, name, z, a, liso, za FROM endf_serve_materials WHERE release = '@R@'),
sec AS (SELECT file_name, mat, mt, qm, qi, lr FROM endfb_sections WHERE release = '@R@' AND mf = 3),
reg AS (SELECT file_name, mat, mt, interpolation_region, max(point_seq) AS nbt, max(interpolation) AS law
        FROM endfb_xs_points WHERE release = '@R@' GROUP BY file_name, mat, mt, interpolation_region),
interp AS (SELECT file_name, mat, mt, array_agg(nbt ORDER BY interpolation_region) AS interp_nbt,
                  array_agg(law ORDER BY interpolation_region) AS interp_law
           FROM reg GROUP BY file_name, mat, mt),
pts AS (SELECT file_name, mat, mt, count(*) AS n_points, min(energy_ev) AS e_min, max(energy_ev) AS e_max,
               array_agg(energy_ev ORDER BY point_seq) AS energy_ev, array_agg(xs_barn ORDER BY point_seq) AS xs_barn
        FROM endfb_xs_points WHERE release = '@R@' GROUP BY file_name, mat, mt)
SELECT '@R@' AS release, m.sublibrary, m.name, m.z, m.a, m.liso, m.za, m.mat, p.mt, p.n_points, p.e_min, p.e_max,
       i.interp_nbt, i.interp_law, sec.qm, sec.qi, sec.lr, p.energy_ev, p.xs_barn, p.n_points AS n_served, false AS thinned
FROM pts p
JOIN interp i ON i.file_name = p.file_name AND i.mat = p.mat AND i.mt = p.mt
JOIN sec ON sec.file_name = p.file_name AND sec.mat = p.mat AND sec.mt = p.mt
JOIN m ON m.file_name = p.file_name AND m.mat = p.mat
ORDER BY m.sublibrary, m.z, m.a, m.liso, p.mt
) TO '@LOC@' WITH (format = 'PARQUET', compression = 'SNAPPY')
