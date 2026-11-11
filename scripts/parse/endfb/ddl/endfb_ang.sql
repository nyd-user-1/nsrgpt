CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_ang` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mt` int,
  `ltt` int,
  `lct` int,
  `li` int,
  `e_seq` int,
  `e_ev` double,
  `e_interpolation` int,
  `form` string,
  `l` int,
  `mu` double,
  `value` double,
  `interpolation` int
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/ang/';
ALTER TABLE `endfb_ang` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/ang/';
