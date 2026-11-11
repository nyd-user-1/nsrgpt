CREATE EXTERNAL TABLE `cinda_dict_labs` (
  `code` string,
  `name` string,
  `country` string,
  `lines` bigint
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/cinda/2024-04-26/dict_labs/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
