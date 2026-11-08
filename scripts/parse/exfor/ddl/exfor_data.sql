CREATE EXTERNAL TABLE `exfor_data` (
  `datasetid` bigint,
  `ivalue` bigint,
  `rvalue` double
)
COMMENT 'X4Pro x4sqlite-20230714-c table DATA'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/DATA/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
