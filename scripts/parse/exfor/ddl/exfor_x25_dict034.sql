CREATE EXTERNAL TABLE `exfor_x25_dict034` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `genflag` string,
  `specialuse` string,
  `shorthelp` string,
  `longexpansion` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT034'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT034/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
