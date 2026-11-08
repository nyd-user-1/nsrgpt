CREATE EXTERNAL TABLE `exfor_dict_chemical_compounds` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary chemical_compounds'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/chemical_compounds/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
