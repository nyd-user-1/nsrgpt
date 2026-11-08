CREATE EXTERNAL TABLE `ensdf_other_records` (
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
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/other_records/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
