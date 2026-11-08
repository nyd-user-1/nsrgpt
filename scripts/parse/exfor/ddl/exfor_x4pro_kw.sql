CREATE EXTERNAL TABLE `exfor_x4pro_kw` (
  `datasetid` string,
  `entry` string,
  `subent` string,
  `pointer` string,
  `keyword` string,
  `isub` bigint,
  `icode` bigint,
  `jcode` string,
  `jfreetext` string,
  `jfreedata` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table x4pro_kw'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/x4pro_kw/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
