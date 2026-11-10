CREATE EXTERNAL TABLE `sweep_public_list` (
  `source_url` string,
  `za` int,
  `liso` int,
  `mt` string,
  `note` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/public_list/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
