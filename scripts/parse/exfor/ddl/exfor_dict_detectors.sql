CREATE EXTERNAL TABLE `exfor_dict_detectors` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary detectors'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/detectors/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
