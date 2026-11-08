CREATE EXTERNAL TABLE `ensdf_levels` (
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
  `jpi` string,
  `half_life` double,
  `half_life_unit` string,
  `half_life_raw` string,
  `half_life_unc` double,
  `half_life_unc_raw` string,
  `l` string,
  `s` double,
  `s_raw` string,
  `s_unc` double,
  `s_unc_raw` string,
  `flag` string,
  `ms` string,
  `question` string,
  `band` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/levels/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
