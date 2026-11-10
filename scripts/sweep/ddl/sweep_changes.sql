CREATE EXTERNAL TABLE `sweep_changes` (
  `key` bigint,
  `target_za` int,
  `liso` int,
  `sublibrary` string,
  `mt` int,
  `target` string,
  `reaction` string,
  `span_lo_ev` double,
  `span_hi_ev` double,
  `n_grid` bigint,
  `rms_log` double,
  `max_log` double,
  `changed` boolean,
  `compared_from` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/changes/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
