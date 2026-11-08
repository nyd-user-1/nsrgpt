CREATE EXTERNAL TABLE `exfor_dict_history` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary history'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/history/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
