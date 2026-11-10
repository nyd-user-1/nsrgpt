CREATE EXTERNAL TABLE IF NOT EXISTS `gnds_files` (
  `sublibrary` string,
  `mat` int,
  `za` int,
  `name` string,
  `file_name` string,
  `key` string,
  `cov_key` string,
  `bytes` bigint,
  `cov_bytes` bigint,
  `xml_bytes` bigint,
  `fudge_version` string,
  `gnds_version` string,
  `seconds` double,
  `ok` boolean,
  `error` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/gnds/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `gnds_files` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/gnds/B-VIII.1/catalog/';
