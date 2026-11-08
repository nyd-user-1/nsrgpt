CREATE EXTERNAL TABLE `nuclide_serve_summary` (
  `z` int,
  `n` int,
  `a` int,
  `symbol` string,
  `name` string,
  `nucid` string,
  `half_life_s` double,
  `half_life_text` string,
  `decay_modes` string,
  `n_levels` int,
  `n_gammas` int,
  `n_datasets` bigint,
  `has_xundl` boolean,
  `adopted_dsid` string,
  `jpi_ground` string,
  `q_minus_kev` double,
  `sn_kev` double,
  `sp_kev` double,
  `qa_kev` double
)
COMMENT 'One row per nuclide ENSDF knows (ENSDF 2026-11-05)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/nuclide/2026-11-05/summary/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
