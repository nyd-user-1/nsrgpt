CREATE EXTERNAL TABLE `exfor_x25_allreaction` (
  `id` bigint,
  `reaction` string,
  `projectile` bigint
)
COMMENT 'X4Pro x4sqlite-20251105-c table allReaction'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/allReaction/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
