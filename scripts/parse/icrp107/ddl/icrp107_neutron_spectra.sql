CREATE EXTERNAL TABLE `icrp107_neutron_spectra` (
  `nuclide` string,
  `seq` int,
  `sf_branching_fraction` double,
  `energy_low_mev` double,
  `energy_high_mev` double,
  `yield_per_transformation` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/icrp107/2008/neutron_spectra/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
