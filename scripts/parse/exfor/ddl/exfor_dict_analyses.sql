CREATE EXTERNAL TABLE `exfor_dict_analyses` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary analyses'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/analyses/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
