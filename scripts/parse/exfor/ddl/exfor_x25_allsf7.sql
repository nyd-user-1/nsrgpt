CREATE EXTERNAL TABLE `exfor_x25_allsf7` (
  `id` bigint,
  `sf7` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table allSF7'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/allSF7/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
