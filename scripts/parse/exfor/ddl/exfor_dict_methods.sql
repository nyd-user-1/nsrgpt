CREATE EXTERNAL TABLE `exfor_dict_methods` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary methods'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/methods/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
