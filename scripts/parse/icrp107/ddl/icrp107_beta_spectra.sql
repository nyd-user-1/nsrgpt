CREATE EXTERNAL TABLE `icrp107_beta_spectra` (
  `nuclide` string,
  `seq` int,
  `energy_mev` double,
  `intensity_per_mev` double,
  `source` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/icrp107/2008/beta_spectra/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
