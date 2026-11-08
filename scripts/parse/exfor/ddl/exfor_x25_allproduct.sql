CREATE EXTERNAL TABLE `exfor_x25_allproduct` (
  `id` bigint,
  `product` string,
  `zprod` bigint
)
COMMENT 'X4Pro x4sqlite-20251105-c table allProduct'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/allProduct/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
