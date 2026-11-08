CREATE EXTERNAL TABLE `ensdf_history` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `text` string,
  `fields` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/history/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
