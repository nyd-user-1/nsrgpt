CREATE EXTERNAL TABLE `exfor_x25_x4src` (
  `subentid` bigint,
  `subacc` string,
  `entry` string,
  `subaccnum` bigint,
  `coding` bigint,
  `src` binary
)
COMMENT 'X4Pro x4sqlite-20251105-c table X4SRC'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/X4SRC/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
