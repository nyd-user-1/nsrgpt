CREATE EXTERNAL TABLE `exfor_x25_dict030` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT030'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT030/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
