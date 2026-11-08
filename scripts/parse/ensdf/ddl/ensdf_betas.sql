CREATE EXTERNAL TABLE `ensdf_betas` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `level_seq` int,
  `energy_kev` double,
  `energy_kev_raw` string,
  `energy_unc` double,
  `energy_unc_raw` string,
  `ib` double,
  `ib_raw` string,
  `ib_unc` double,
  `ib_unc_raw` string,
  `logft` double,
  `logft_raw` string,
  `logft_unc` double,
  `logft_unc_raw` string,
  `flag` string,
  `un` string,
  `question` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/betas/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
