CREATE EXTERNAL TABLE `exfor_dict_modifiers` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary modifiers'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/modifiers/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
