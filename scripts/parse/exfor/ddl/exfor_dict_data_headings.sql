CREATE EXTERNAL TABLE `exfor_dict_data_headings` (
  `diction` bigint,
  `code` string,
  `description` string,
  `additional_code` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary data_headings'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/data_headings/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
