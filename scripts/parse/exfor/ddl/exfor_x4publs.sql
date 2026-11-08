CREATE EXTERNAL TABLE `exfor_x4publs` (
  `publication` string,
  `publtype` bigint,
  `publsrc` binary
)
COMMENT 'X4Pro x4sqlite-20230714-c table X4PUBLS'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/X4PUBLS/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
