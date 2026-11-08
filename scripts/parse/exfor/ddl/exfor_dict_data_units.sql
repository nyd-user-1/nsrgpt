CREATE EXTERNAL TABLE `exfor_dict_data_units` (
  `diction` bigint,
  `code` string,
  `description` string,
  `additional_code` string,
  `unit_conversion_factor` double,
  `active` boolean
)
COMMENT 'EXFOR dictionary data_units'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/data_units/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
