CREATE EXTERNAL TABLE `exfor_keyword` (
  `subentid` bigint,
  `ikeyword` bigint,
  `entryid` bigint,
  `entry` string,
  `subaccnum` bigint,
  `keyword` string,
  `pointer` string,
  `inums` bigint,
  `typecode` bigint,
  `code` string,
  `memocode` string,
  `freetext` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table KEYWORD'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/KEYWORD/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
