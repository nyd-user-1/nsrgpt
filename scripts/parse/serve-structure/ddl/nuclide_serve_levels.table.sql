CREATE EXTERNAL TABLE `nuclide_serve_levels` (
  `z` int,
  `n` int,
  `a` int,
  `name` string,
  `level_seq` int,
  `energy_kev` double,
  `energy_text` string,
  `energy_unc` double,
  `jpi` string,
  `half_life_s` double,
  `half_life_text` string,
  `decay_modes_text` string,
  `ms` string,
  `band` string,
  `flag` string
)
COMMENT 'Adopted levels (ENSDF 2026-11-05)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/nuclide/2026-11-05/levels/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
