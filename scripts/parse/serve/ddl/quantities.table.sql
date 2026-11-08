CREATE EXTERNAL TABLE `exfor_serve_quantities` (
  `quantity` string,
  `sf6` string,
  `description` string,
  `units_family` string,
  `sf6_description` string,
  `datasets` bigint,
  `subentries` bigint,
  `entries` bigint,
  `targets` bigint
)
COMMENT 'EXFOR serving table quantities (2026-10-28)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/quantities/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
