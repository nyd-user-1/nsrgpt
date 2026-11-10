CREATE EXTERNAL TABLE `sweep_bins` (
  `release` string,
  `key` bigint,
  `target_za` int,
  `liso` int,
  `sublibrary` string,
  `mt` int,
  `target` string,
  `reaction` string,
  `bin` int,
  `e_lo_ev` double,
  `e_hi_ev` double,
  `n_points` bigint,
  `n_datasets` bigint,
  `mean_log_ratio` double,
  `se` double,
  `mean_log_ratio_points` double,
  `mean_ratio` double,
  `rel_sd_eval` double,
  `z` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/bins/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
