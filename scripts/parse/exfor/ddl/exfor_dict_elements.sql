CREATE EXTERNAL TABLE `exfor_dict_elements` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary elements'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/elements/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
