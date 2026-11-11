CREATE EXTERNAL TABLE `cinda_dict_quantities` (
  `code` string,
  `word` string,
  `web_quantity` string,
  `lines` bigint
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/cinda/2024-04-26/dict_quantities/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
