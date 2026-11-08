CREATE EXTERNAL TABLE `exfor_dict_branches` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary branches'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/branches/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
