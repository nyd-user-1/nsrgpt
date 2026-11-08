CREATE EXTERNAL TABLE `exfor_allsf1` (
  `id` bigint,
  `sf1` string,
  `ztarg` bigint
)
COMMENT 'X4Pro x4sqlite-20230714-c table allSF1'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allSF1/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
