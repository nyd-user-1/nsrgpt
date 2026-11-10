CREATE EXTERNAL TABLE `sweep_datasets` (
  `release` string,
  `key` bigint,
  `target_za` int,
  `liso` int,
  `sublibrary` string,
  `mt` int,
  `target` string,
  `reaction` string,
  `dataset` string,
  `entry` string,
  `author` string,
  `year` bigint,
  `n_points` bigint,
  `mean_log_ratio` double,
  `se` double,
  `median_rel_unc` double,
  `median_ratio` double,
  `e_min_ev` double,
  `e_max_ev` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/datasets/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
