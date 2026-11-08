CREATE EXTERNAL TABLE `exfor_allkeyword` (
  `id` bigint,
  `keyword` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table allKeyWord'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allKeyWord/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
