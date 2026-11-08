CREATE EXTERNAL TABLE `ensdf_cards` (
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
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/cards/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
