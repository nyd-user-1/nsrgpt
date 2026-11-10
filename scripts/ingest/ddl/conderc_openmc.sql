CREATE EXTERNAL TABLE `conderc_openmc` (
  `benchmark` string,
  `case` string,
  `library` string,
  `k_eff` double,
  `k_eff_unc` double,
  `k_collision` double,
  `k_tracklength` double,
  `k_absorption` double,
  `leakage` double,
  `leakage_unc` double,
  `nuclides` string,
  `n_nuclides` int,
  `run_at` string,
  `stdout_key` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/conderc/2026-11-11/openmc/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
