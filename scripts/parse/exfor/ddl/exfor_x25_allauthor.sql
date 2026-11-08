CREATE EXTERNAL TABLE `exfor_x25_allauthor` (
  `id` bigint,
  `author` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table allAuthor'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/allAuthor/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
