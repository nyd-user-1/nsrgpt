CREATE EXTERNAL TABLE `icrp107_nuclides` (
  `record` int,
  `nuclide` string,
  `element` string,
  `z` int,
  `a` int,
  `isomer` string,
  `half_life` double,
  `half_life_unit` string,
  `half_life_s` double,
  `decay_modes` string,
  `rad_record` int,
  `bet_record` int,
  `ack_record` int,
  `nsf_record` int,
  `e_alpha_mev` double,
  `e_electron_mev` double,
  `e_photon_mev` double,
  `n_photons_lt_10kev` int,
  `n_photons_ge_10kev` int,
  `n_betas` int,
  `n_mono_electrons` int,
  `n_alphas` int,
  `atomic_mass_u` double,
  `air_kerma_rate_const` double,
  `air_kerma_coef` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/icrp107/2008/nuclides/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
