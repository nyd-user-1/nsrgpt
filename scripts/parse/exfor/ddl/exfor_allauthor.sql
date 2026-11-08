CREATE EXTERNAL TABLE `exfor_allauthor` (
  `id` bigint,
  `author` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table allAuthor'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allAuthor/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
