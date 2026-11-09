CREATE EXTERNAL TABLE IF NOT EXISTS `endf_serve_materials` (
  `sublibrary` string,
  `folder` string,
  `mat` int,
  `za` double,
  `z` int,
  `a` int,
  `liso` int,
  `name` string,
  `zsymam` string,
  `awr` double,
  `temp_k` double,
  `nsub` int,
  `lrp` int,
  `file_name` string,
  `n_mf3_sections` bigint,
  `n_points` bigint,
  `lab` string,
  `edate` string,
  `authors` string
)
COMMENT 'ENDF/B materials, one row each'
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.1/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.0/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VII.1/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VII.0/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VI.8/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-V/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-IV/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-III/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-II/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.1-point-293.6K/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.1-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.1-point-0K/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-293.6K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.0-point-293.6K/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='B-VIII.0-point-0K') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/B-VIII.0-point-0K/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/CENDL-3.2/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/JEFF-3.3/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/JENDL-5/materials/';
ALTER TABLE `endf_serve_materials` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/TENDL-2023/materials/';
