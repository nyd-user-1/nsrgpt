CREATE EXTERNAL TABLE `ensdf_xrefs` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `dssym` string,
  `xref_dsid` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/xrefs/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
