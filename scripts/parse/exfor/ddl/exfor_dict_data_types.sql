CREATE EXTERNAL TABLE `exfor_dict_data_types` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary data_types'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/data_types/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
