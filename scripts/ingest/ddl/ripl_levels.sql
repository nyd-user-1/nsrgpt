CREATE EXTERNAL TABLE `ripl_levels` (
  `z` int,
  `a` int,
  `symb` string,
  `level` int,
  `e_mev` double,
  `spin` double,
  `parity` int,
  `half_life_s` double,
  `n_gammas` int,
  `spin_flag` string,
  `energy_unc` string,
  `spins_ensdf` string,
  `n_decay_modes` int,
  `decay_modes` string,
  `shift_mev` double,
  `band` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ripl/ripl-4-2026-05/levels/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
