CREATE EXTERNAL TABLE `xundl_cards` (
  `release` string,
  `dataset_seq` int,
  `file_name` string,
  `line_no` int,
  `card_seq` int,
  `nucid` string,
  `continuation` string,
  `col7` string,
  `rtype` string,
  `text` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/cards/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
