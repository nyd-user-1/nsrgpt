CREATE EXTERNAL TABLE `xundl_references` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `keynum` string,
  `reference` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/references/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
