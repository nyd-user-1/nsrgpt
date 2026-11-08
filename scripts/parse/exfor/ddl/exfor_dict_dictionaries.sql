CREATE EXTERNAL TABLE `exfor_dict_dictionaries` (
  `diction` bigint,
  `description` string,
  `active` boolean,
  `table` string,
  `codes` bigint
)
COMMENT 'EXFOR dictionary dictionaries'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/dictionaries/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
