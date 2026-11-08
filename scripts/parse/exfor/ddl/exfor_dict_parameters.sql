CREATE EXTERNAL TABLE `exfor_dict_parameters` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary parameters'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/parameters/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
