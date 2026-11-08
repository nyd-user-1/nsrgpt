CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_sections` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mf` int,
  `mt` int,
  `line_count` int,
  `first_line` int,
  `za` double,
  `awr` double,
  `qm` double,
  `qi` double,
  `lr` int,
  `nr` int,
  `np` int,
  `parser` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-293.6K/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-0K/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-293.6K/sections/';
ALTER TABLE `endfb_sections` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-0K/sections/';
