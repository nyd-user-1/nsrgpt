CREATE EXTERNAL TABLE `exfor_dict_system_identifiers` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary system_identifiers'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/system_identifiers/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
