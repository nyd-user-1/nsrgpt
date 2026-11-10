CREATE EXTERNAL TABLE `iaea_records` (
  `id` string,
  `doi` string,
  `title` string,
  `publication_date` string,
  `year` int,
  `resource_type` string,
  `creators` string,
  `n_files` int,
  `bytes` bigint,
  `held_files` int,
  `held_bytes` bigint,
  `url` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/iaea-records/2026-11-08/records/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
