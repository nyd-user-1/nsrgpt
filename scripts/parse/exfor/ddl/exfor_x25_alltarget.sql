CREATE EXTERNAL TABLE `exfor_x25_alltarget` (
  `id` bigint,
  `target` string,
  `ztarg` bigint
)
COMMENT 'X4Pro x4sqlite-20251105-c table allTarget'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/allTarget/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
