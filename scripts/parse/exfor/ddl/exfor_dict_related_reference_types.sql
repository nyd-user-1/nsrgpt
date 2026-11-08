CREATE EXTERNAL TABLE `exfor_dict_related_reference_types` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary related_reference_types'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/related_reference_types/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
