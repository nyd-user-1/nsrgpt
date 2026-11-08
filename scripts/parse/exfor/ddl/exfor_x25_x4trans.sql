CREATE EXTERNAL TABLE `exfor_x25_x4trans` (
  `updateno` bigint,
  `nentries` bigint,
  `nsubentries` bigint,
  `ndatalines` bigint,
  `transid` string,
  `transdate` string,
  `transfile` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table X4TRANS'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/X4TRANS/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
