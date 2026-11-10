CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_records` (
  `sublibrary` string,
  `file_name` string,
  `line_no` int,
  `mat` int,
  `mf` int,
  `mt` int,
  `text` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-293.6K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-0K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-293.6K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-0K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-600K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-600K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-900K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-900K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-1200K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-1200K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-1500K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-1500K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-1800K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-1800K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-600K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-600K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-900K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-900K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-1200K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-1200K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-1500K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-1500K/records/';
ALTER TABLE `endfb_records` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-1800K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-1800K/records/';
