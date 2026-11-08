CREATE EXTERNAL TABLE `exfor_dict_supplemental_information` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary supplemental_information'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/supplemental_information/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
