CREATE EXTERNAL TABLE `exfor_dict_facilities` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary facilities'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/facilities/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
