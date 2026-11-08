CREATE EXTERNAL TABLE `xundl_delayed` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `level_seq` int,
  `particle` string,
  `energy_kev` double,
  `energy_kev_raw` string,
  `energy_unc` double,
  `energy_unc_raw` string,
  `ip` double,
  `ip_raw` string,
  `ip_unc` double,
  `ip_unc_raw` string,
  `ei` double,
  `ei_raw` string,
  `half_life` double,
  `half_life_unit` string,
  `half_life_raw` string,
  `half_life_unc` double,
  `half_life_unc_raw` string,
  `l` string,
  `flag` string,
  `coincidence` string,
  `question` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/delayed/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
