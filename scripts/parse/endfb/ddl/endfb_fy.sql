CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_fy` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mt` int,
  `energy_seq` int,
  `energy_ev` double,
  `interpolation` int,
  `zafp` double,
  `fps` double,
  `yield` double,
  `yield_unc` double
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/fy/';
ALTER TABLE `endfb_fy` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/fy/';
