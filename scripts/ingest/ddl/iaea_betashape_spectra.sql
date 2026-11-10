CREATE EXTERNAL TABLE `iaea_betashape_spectra` (
  `rad_type` string,
  `nuclide` string,
  `p_z` int,
  `p_n` int,
  `p_symbol` string,
  `p_energy` double,
  `d_z` int,
  `d_n` int,
  `d_symbol` string,
  `bin_en` double,
  `dn_de` double,
  `unc_dn_de` double,
  `dn_de_nu` double,
  `unc_dn_de_nu` double,
  `extraction_date` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/iaea-betashape/2026-11-11/spectra/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
