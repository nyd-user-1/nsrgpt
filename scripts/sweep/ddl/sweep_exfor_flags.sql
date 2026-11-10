CREATE EXTERNAL TABLE `sweep_exfor_flags` (
  `rule` string,
  `subentry` string,
  `entry` string,
  `author` string,
  `year` bigint,
  `institute` string,
  `reference` string,
  `code` string,
  `target` string,
  `reaction` string,
  `sublibrary` string,
  `mt` int,
  `units` string,
  `n_points` bigint,
  `factor` double,
  `note` string,
  `median_ratio_by_release` string,
  `exfor_url` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/exfor_flags/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
