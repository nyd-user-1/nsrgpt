CREATE EXTERNAL TABLE `nuclide_serve_decays` (
  `parent` string,
  `parent_z` int,
  `parent_a` int,
  `daughter` string,
  `daughter_z` int,
  `daughter_a` int,
  `mode` string,
  `dsid` string,
  `parent_level_kev` double,
  `parent_jpi` string,
  `half_life_s` double,
  `half_life_text` string,
  `q_kev` double,
  `q_unc_kev` double,
  `branching_pct` double,
  `branching_unc_pct` double,
  `n_gammas` int,
  `n_parents` bigint,
  `dataset_seq` int
)
COMMENT 'One row per decay dataset (ENSDF 2026-11-05)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/nuclide/2026-11-05/decays/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
