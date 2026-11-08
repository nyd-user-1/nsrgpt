CREATE EXTERNAL TABLE `exfor_serve_reactions` (
  `reaction` string,
  `projectile` string,
  `process` string,
  `projectile_name` string,
  `datasets` bigint,
  `subentries` bigint,
  `entries` bigint,
  `targets` bigint
)
COMMENT 'EXFOR serving table reactions (2026-10-28)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/reactions/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
