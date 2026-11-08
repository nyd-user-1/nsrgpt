CREATE EXTERNAL TABLE `exfor_dict_journals` (
  `diction` bigint,
  `code` string,
  `description` string,
  `pulished_country_code` string,
  `pulished_country_name` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary journals'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/journals/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
