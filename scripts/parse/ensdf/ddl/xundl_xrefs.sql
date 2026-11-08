CREATE EXTERNAL TABLE `xundl_xrefs` (
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
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/xrefs/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
