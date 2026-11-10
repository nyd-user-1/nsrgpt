CREATE EXTERNAL TABLE `sweep_flags` (
  `rank` bigint,
  `key` bigint,
  `target` string,
  `reaction` string,
  `sublibrary` string,
  `mt` int,
  `z` double,
  `mean_log_ratio` double,
  `mean_ratio` double,
  `weighted_log_ratio` double,
  `se` double,
  `rel_sd_eval` double,
  `mf33` boolean,
  `max_bin_dev` double,
  `max_bin_e_ev` double,
  `n_points` bigint,
  `n_datasets` bigint,
  `driver_dataset` string,
  `driver_effect` double,
  `datasets` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/flags/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
