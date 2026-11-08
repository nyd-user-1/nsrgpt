CREATE EXTERNAL TABLE `exfor_reacode` (
  `reacodeid` string,
  `subentid` bigint,
  `subacc` string,
  `pointer` string,
  `nreacstr` bigint,
  `ndatalines` bigint,
  `emin` double,
  `emax` double,
  `zatarget1` bigint,
  `zaincident1` bigint,
  `mf` bigint,
  `mt` bigint,
  `nnan` bigint,
  `nne2` bigint,
  `anmin` double,
  `anmax` double,
  `e2min` double,
  `e2max` double,
  `i78` string,
  `iprogress` bigint,
  `reaccombi` string,
  `outparticles` string,
  `fullcode` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table REACODE'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/REACODE/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
