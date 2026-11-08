CREATE EXTERNAL TABLE `xundl_alphas` (
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
  `ia` double,
  `ia_raw` string,
  `ia_unc` double,
  `ia_unc_raw` string,
  `hf` double,
  `hf_raw` string,
  `hf_unc` double,
  `hf_unc_raw` string,
  `flag` string,
  `question` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/alphas/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
