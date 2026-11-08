CREATE EXTERNAL TABLE `exfor_dict_processes` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary processes'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/processes/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
