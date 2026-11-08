CREATE EXTERNAL TABLE `exfor_dict_information_identifiers` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary information_identifiers'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/information_identifiers/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
