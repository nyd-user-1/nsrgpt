CREATE EXTERNAL TABLE `ensdf_comments` (
  `release` string,
  `dataset_seq` int,
  `nucid` string,
  `dsid` string,
  `card_seq` int,
  `card_count` int,
  `level_seq` int,
  `comment_type` string,
  `rtype` string,
  `psym` string,
  `text` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/comments/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
