CREATE EXTERNAL TABLE `exfor_x25_dict004` (
  `id` bigint,
  `type` string,
  `code` string,
  `statflag` string,
  `dictnum` string,
  `free` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT004'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT004/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
