CREATE EXTERNAL TABLE `exfor_x25_dict003c` (
  `id` bigint,
  `code` string,
  `code2` string,
  `statflag` string,
  `zone` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT003C'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT003C/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
