CREATE EXTERNAL TABLE `exfor_allreference` (
  `id` bigint,
  `reference` string,
  `dict` string,
  `country` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table allReference'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allReference/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
