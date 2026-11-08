CREATE EXTERNAL TABLE `exfor_dict_reaction_types` (
  `diction` bigint,
  `code` string,
  `description` string,
  `additional_code` string,
  `x4code3` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary reaction_types'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/reaction_types/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
