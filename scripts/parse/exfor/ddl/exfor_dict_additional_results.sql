CREATE EXTERNAL TABLE `exfor_dict_additional_results` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary additional_results'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/additional_results/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
