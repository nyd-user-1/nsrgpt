CREATE EXTERNAL TABLE `exfor_x25_quantity` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table QUANTITY'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/QUANTITY/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
