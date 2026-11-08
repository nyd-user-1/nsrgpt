CREATE EXTERNAL TABLE `exfor_allsf2` (
  `id` bigint,
  `sf2` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table allSF2'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allSF2/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
