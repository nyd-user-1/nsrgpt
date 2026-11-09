CREATE EXTERNAL TABLE IF NOT EXISTS `endf_serve_xs` (
  `sublibrary` string,
  `name` string,
  `z` int,
  `a` int,
  `liso` int,
  `za` double,
  `mat` int,
  `mt` int,
  `n_points` bigint,
  `e_min` double,
  `e_max` double,
  `interp_nbt` array<int>,
  `interp_law` array<int>,
  `qm` double,
  `qi` double,
  `lr` int,
  `energy_ev` array<double>,
  `xs_barn` array<double>,
  `n_served` bigint,
  `thinned` boolean
)
COMMENT 'ENDF/B MF3 cross sections as point arrays, one row each'
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.1/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.0/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VII.1/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VII.0/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VI.8/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-V/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-IV/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-III/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-II/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.1-point-293.6K/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.1-point-0K/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.0-point-293.6K/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.0-point-0K/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/CENDL-3.2/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/JEFF-3.3/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/JENDL-5/xs/';
ALTER TABLE `endf_serve_xs` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/TENDL-2023/xs/';
