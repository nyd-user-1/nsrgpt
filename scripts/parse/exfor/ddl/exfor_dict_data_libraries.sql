CREATE EXTERNAL TABLE `exfor_dict_data_libraries` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary data_libraries'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/data_libraries/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
