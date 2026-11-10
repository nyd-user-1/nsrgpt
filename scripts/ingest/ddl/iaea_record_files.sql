CREATE EXTERNAL TABLE `iaea_record_files` (
  `id` string,
  `name` string,
  `size` bigint,
  `md5` string,
  `ext` string,
  `class` string,
  `access` string,
  `wayback_captures` int,
  `held` boolean,
  `held_key` string,
  `url` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/iaea-records/2026-11-08/files/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
