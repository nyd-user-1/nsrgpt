CREATE EXTERNAL TABLE `exfor_dict016` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `shorthelp` string,
  `longexpansion` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table DICT016'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/DICT016/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
