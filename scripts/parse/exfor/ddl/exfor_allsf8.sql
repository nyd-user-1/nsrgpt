CREATE EXTERNAL TABLE `exfor_allsf8` (
  `id` bigint,
  `sf8` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table allSF8'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allSF8/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
