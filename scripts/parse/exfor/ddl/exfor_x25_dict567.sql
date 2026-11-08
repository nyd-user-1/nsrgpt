CREATE EXTERNAL TABLE `exfor_x25_dict567` (
  `id` bigint,
  `dict` string,
  `code` string,
  `statflag` string,
  `ref` string,
  `zone` string,
  `country` string,
  `institute` string,
  `shorthelp` string,
  `longexpansion` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT567'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT567/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
