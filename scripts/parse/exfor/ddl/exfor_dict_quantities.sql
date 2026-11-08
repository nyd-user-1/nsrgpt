CREATE EXTERNAL TABLE `exfor_dict_quantities` (
  `diction` bigint,
  `code` string,
  `description` string,
  `additional_code` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary quantities'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/quantities/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
