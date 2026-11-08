CREATE EXTERNAL TABLE `exfor_dict_institutes` (
  `diction` bigint,
  `code` string,
  `description` string,
  `latitude` double,
  `longitude` double,
  `address` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary institutes'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/institutes/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
