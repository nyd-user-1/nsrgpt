CREATE EXTERNAL TABLE `exfor_x4bibkw` (
  `subentid` bigint,
  `ikw` bigint,
  `nlines` bigint,
  `entryid` bigint,
  `entry` string,
  `isub` bigint,
  `subent` string,
  `keyword` string,
  `inums` bigint,
  `freetext` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table x4bibkw'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/x4bibkw/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
