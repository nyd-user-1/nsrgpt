CREATE EXTERNAL TABLE `xundl_other_records` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `counted` boolean,
  `col7` string,
  `rtype` string,
  `col9` string,
  `text` string,
  `continuation` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/other_records/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
