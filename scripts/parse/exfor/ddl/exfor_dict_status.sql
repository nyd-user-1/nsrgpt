CREATE EXTERNAL TABLE `exfor_dict_status` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary status'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/status/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
