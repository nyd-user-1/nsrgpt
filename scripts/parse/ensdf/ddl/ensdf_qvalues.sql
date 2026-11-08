CREATE EXTERNAL TABLE `ensdf_qvalues` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `q_minus` double,
  `q_minus_raw` string,
  `q_minus_unc` double,
  `q_minus_unc_raw` string,
  `sn` double,
  `sn_raw` string,
  `sn_unc` double,
  `sn_unc_raw` string,
  `sp` double,
  `sp_raw` string,
  `sp_unc` double,
  `sp_unc_raw` string,
  `qa` double,
  `qa_raw` string,
  `qa_unc` double,
  `qa_unc_raw` string,
  `qref` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/qvalues/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
