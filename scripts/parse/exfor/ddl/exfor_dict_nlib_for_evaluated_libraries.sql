CREATE EXTERNAL TABLE `exfor_dict_nlib_for_evaluated_libraries` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary nlib_for_evaluated_libraries'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/nlib_for_evaluated_libraries/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
