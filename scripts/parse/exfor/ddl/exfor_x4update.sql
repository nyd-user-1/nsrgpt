CREATE EXTERNAL TABLE `exfor_x4update` (
  `updateno` bigint,
  `updatedate` timestamp,
  `updateflag` string,
  `comment` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table X4UPDATE'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/X4UPDATE/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
