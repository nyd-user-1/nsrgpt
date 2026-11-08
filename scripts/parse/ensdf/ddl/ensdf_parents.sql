CREATE EXTERNAL TABLE `ensdf_parents` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `parent_seq` string,
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
  `qp` double,
  `qp_raw` string,
  `qp_unc` double,
  `qp_unc_raw` string,
  `ion` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/parents/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
