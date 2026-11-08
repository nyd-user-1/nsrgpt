CREATE EXTERNAL TABLE `exfor_x25_allkeyword` (
  `id` bigint,
  `keyword` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table allKeyWord'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/allKeyWord/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
