CREATE EXTERNAL TABLE `sweep_retrodiction` (
  `rank` bigint,
  `key` bigint,
  `target` string,
  `reaction` string,
  `sublibrary` string,
  `mt` int,
  `z` double,
  `max_bin_z` double,
  `mean_log_ratio_v80` double,
  `mean_log_ratio_v81` double,
  `weighted_log_ratio_v80` double,
  `weighted_log_ratio_v81` double,
  `z_v81` double,
  `changed` boolean,
  `rms_log` double,
  `max_log` double,
  `moved_toward_data` boolean,
  `n_points` bigint,
  `n_datasets` bigint,
  `support_points` bigint,
  `support_datasets` bigint
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/retrodiction/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
