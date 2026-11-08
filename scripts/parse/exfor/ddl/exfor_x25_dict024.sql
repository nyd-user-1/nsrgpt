CREATE EXTERNAL TABLE `exfor_x25_dict024` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `category` string,
  `shorthelp` string,
  `longexpansion` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT024'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT024/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
