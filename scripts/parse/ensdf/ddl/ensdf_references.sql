CREATE EXTERNAL TABLE `ensdf_references` (
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
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/references/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
