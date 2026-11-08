CREATE EXTERNAL TABLE `exfor_dict_reference_types` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary reference_types'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/reference_types/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
