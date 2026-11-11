CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_mult` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mf` int,
  `mt` int,
  `subsection` int,
  `izap` double,
  `lis` int,
  `lfs` int,
  `qm` double,
  `qi` double,
  `e_seq` int,
  `e_ev` double,
  `value` double,
  `interpolation` int
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/mult/';
ALTER TABLE `endfb_mult` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/mult/';
