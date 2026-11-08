CREATE EXTERNAL TABLE `exfor_header` (
  `datasetid` bigint,
  `subentid` bigint,
  `icol` bigint,
  `pointer` string,
  `flagcd` string,
  `header` string,
  `units` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table HEADER'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/HEADER/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
