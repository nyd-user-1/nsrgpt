CREATE EXTERNAL TABLE `exfor_serve_targets` (
  `target` string,
  `target_sym` string,
  `target_za` bigint,
  `target_z` int,
  `target_state` string,
  `element` string,
  `datasets` bigint,
  `subentries` bigint,
  `entries` bigint,
  `points` bigint
)
COMMENT 'EXFOR serving table targets (2026-10-28)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/targets/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
