CREATE EXTERNAL TABLE `exfor_x25_dictc14a` (
  `id` bigint,
  `code` string,
  `zaprojectile` bigint,
  `mf` bigint,
  `mt` bigint,
  `opnum` bigint
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICTC14A'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICTC14A/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
