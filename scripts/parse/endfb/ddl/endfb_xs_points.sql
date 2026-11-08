CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_xs_points` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mt` int,
  `point_seq` int,
  `energy_ev` double,
  `xs_barn` double,
  `interpolation_region` int,
  `interpolation` int
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/xs_points/';
ALTER TABLE `endfb_xs_points` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/xs_points/';
