CREATE EXTERNAL TABLE `xundl_history` (
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
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/history/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
