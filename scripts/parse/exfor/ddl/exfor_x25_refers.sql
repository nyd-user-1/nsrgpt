CREATE EXTERNAL TABLE `exfor_x25_refers` (
  `entryid` bigint,
  `ireference` bigint,
  `isub` bigint,
  `entry` string,
  `reference` string,
  `publication` string,
  `stdfilename` string,
  `dict` string,
  `type` string,
  `ref` string,
  `refdic` string,
  `nsrkeyno` string,
  `doi` string,
  `inisrn` bigint,
  `authorslist` string,
  `title` string,
  `dateref` date
)
COMMENT 'X4Pro x4sqlite-20251105-c table REFERS'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/REFERS/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
