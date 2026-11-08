CREATE EXTERNAL TABLE `exfor_dict_particles` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary particles'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/particles/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
