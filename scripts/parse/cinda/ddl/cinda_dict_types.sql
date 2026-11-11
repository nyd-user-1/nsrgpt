CREATE EXTERNAL TABLE `cinda_dict_types` (
  `code` string,
  `word` string,
  `lines` bigint
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/cinda/2024-04-26/dict_types/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
