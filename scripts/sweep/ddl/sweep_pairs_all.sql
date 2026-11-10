CREATE EXTERNAL TABLE `sweep_pairs_all` (
  `key` bigint,
  `target_za` int,
  `liso` int,
  `sublibrary` string,
  `mt` int,
  `target` string,
  `reaction` string,
  `exfor_reaction` string,
  `n_datasets` bigint,
  `n_points` bigint,
  `e_min_ev` double,
  `e_max_ev` double,
  `held_b_viii_1` boolean,
  `held_b_viii_0` boolean,
  `held_jeff_3_3` boolean,
  `held_jendl_5` boolean,
  `held_tendl_2023` boolean,
  `held_cendl_3_2` boolean
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/pairs_all/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
