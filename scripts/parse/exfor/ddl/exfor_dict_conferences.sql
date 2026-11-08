CREATE EXTERNAL TABLE `exfor_dict_conferences` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary conferences'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/conferences/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
