CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_materials` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `za` double,
  `zsymam` string,
  `awr` double,
  `lrp` int,
  `lfi` int,
  `nlib` int,
  `nmod` int,
  `elis` double,
  `sta` double,
  `lis` int,
  `liso` int,
  `nfor` int,
  `awi` double,
  `emax` double,
  `lrel` int,
  `nsub` int,
  `nver` int,
  `temp_k` double,
  `ldrv` int,
  `nwd` int,
  `nxc` int,
  `alab` string,
  `edate` string,
  `auth` string,
  `ref` string,
  `ddate` string,
  `rdate` string,
  `endate` string,
  `hsub` string,
  `description` string,
  `section_count` int,
  `line_count` int,
  `parser` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-293.6K/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1-point-0K/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-293.6K/materials/';
ALTER TABLE `endfb_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0-point-0K/materials/';
