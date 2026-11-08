CREATE EXTERNAL TABLE `exfor_dict_incident_sources` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary incident_sources'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/incident_sources/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
