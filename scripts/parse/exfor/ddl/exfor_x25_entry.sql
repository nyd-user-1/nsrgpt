CREATE EXTERNAL TABLE `exfor_x25_entry` (
  `entryid` bigint,
  `entry` string,
  `origentry` string,
  `area` string,
  `exparea` string,
  `centerid` bigint,
  `datedebut` date,
  `updateno` bigint,
  `transid` string,
  `transdate` string,
  `transfile` string,
  `ninstitutes` bigint,
  `institute1` string,
  `nauthors` bigint,
  `author1ini` string,
  `author1` string,
  `nreferences` bigint,
  `reference1` string,
  `ref1` string,
  `yearref1` bigint,
  `publication1` string,
  `stdfilename` string,
  `typeref1` string,
  `nsrkeyno` string,
  `doi` string,
  `compilerid` string,
  `inisrn` bigint
)
COMMENT 'X4Pro x4sqlite-20251105-c table ENTRY'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/ENTRY/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
