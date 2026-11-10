CREATE EXTERNAL TABLE `ripl_level_nuclides` (
  `z` int,
  `a` int,
  `symb` string,
  `n_levels` int,
  `n_gammas` int,
  `n_max` int,
  `n_c` int,
  `sn_mev` double,
  `sp_mev` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ripl/ripl-4-2026-05/level_nuclides/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
