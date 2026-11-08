CREATE EXTERNAL TABLE `exfor_dict031` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `shorthelp` string,
  `longexpansion` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table DICT031'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/DICT031/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
