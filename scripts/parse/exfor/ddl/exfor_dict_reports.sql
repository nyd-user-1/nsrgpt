CREATE EXTERNAL TABLE `exfor_dict_reports` (
  `diction` bigint,
  `code` string,
  `description` string,
  `publisher` string,
  `publisher_name` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary reports'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/reports/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
