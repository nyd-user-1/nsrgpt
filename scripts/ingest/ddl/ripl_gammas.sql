CREATE EXTERNAL TABLE `ripl_gammas` (
  `z` int,
  `a` int,
  `level` int,
  `final_level` int,
  `e_gamma_mev` double,
  `p_gamma` double,
  `p_electromagnetic` double,
  `icc` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ripl/ripl-4-2026-05/gammas/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
