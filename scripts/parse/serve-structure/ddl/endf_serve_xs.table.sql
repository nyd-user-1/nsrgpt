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
  `xs_barn` array<double>
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
