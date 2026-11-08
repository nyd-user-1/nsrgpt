CREATE EXTERNAL TABLE `exfor_allref` (
  `id` bigint,
  `ref` string,
  `dict` string,
  `country` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table allRef'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allRef/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
