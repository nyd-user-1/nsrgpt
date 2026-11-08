CREATE EXTERNAL TABLE `nuclide_serve_gammas` (
  `z` int,
  `n` int,
  `a` int,
  `name` string,
  `level_seq` int,
  `level_energy_kev` double,
  `final_level_seq` int,
  `final_level_energy_kev` double,
  `e_gamma_kev` double,
  `e_gamma_unc` double,
  `e_gamma_text` string,
  `ri` double,
  `ri_unc` double,
  `mult` string,
  `mr` double,
  `mr_unc` double,
  `cc` double,
  `cc_unc` double,
  `ti` double,
  `ti_unc` double
)
COMMENT 'Adopted gammas with resolved final levels (ENSDF 2026-11-05)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/nuclide/2026-11-05/gammas/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
