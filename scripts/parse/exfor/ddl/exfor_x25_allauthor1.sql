CREATE EXTERNAL TABLE `exfor_x25_allauthor1` (
  `id` bigint,
  `author1` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table allAuthor1'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/allAuthor1/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
