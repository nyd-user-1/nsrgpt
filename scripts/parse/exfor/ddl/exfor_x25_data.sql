CREATE EXTERNAL TABLE `exfor_x25_data` (
  `datasetid` bigint,
  `ivalue` bigint,
  `rvalue` double
)
COMMENT 'X4Pro x4sqlite-20251105-c table DATA'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DATA/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
