CREATE EXTERNAL TABLE `exfor_allreaction` (
  `id` bigint,
  `reaction` string,
  `projectile` bigint
)
COMMENT 'X4Pro x4sqlite-20230714-c table allReaction'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allReaction/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
