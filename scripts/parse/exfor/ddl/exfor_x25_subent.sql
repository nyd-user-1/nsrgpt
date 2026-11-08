CREATE EXTERNAL TABLE `exfor_x25_subent` (
  `subentid` bigint,
  `subacc` string,
  `entryid` bigint,
  `entry` string,
  `origentry` string,
  `origsubent` string,
  `spsdd` string,
  `dateupd` timestamp,
  `datecompil` date,
  `updateno` bigint,
  `transid` string,
  `transdate` string,
  `transfile` string,
  `nreac` bigint,
  `nreacstr` bigint,
  `cdatasetid` bigint,
  `cncol` bigint,
  `cnrow` bigint,
  `ddatasetid` bigint,
  `dncol` bigint,
  `dnrow` bigint
)
COMMENT 'X4Pro x4sqlite-20251105-c table SUBENT'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/SUBENT/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
