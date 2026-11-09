CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_cov` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mt` int,
  `mtl` int,
  `mat1` int,
  `mt1` int,
  `xmf1` double,
  `xlfs1` double,
  `block` string,
  `ni_index` int,
  `lb` int,
  `lt` int,
  `ls` int,
  `pair_set` int,
  `row_energy_ev` double,
  `row_energy_hi_ev` double,
  `col_energy_ev` double,
  `col_energy_hi_ev` double,
  `value` double,
  `params` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/cov/';
ALTER TABLE `endfb_cov` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/cov/';
