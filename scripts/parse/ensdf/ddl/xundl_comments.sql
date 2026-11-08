CREATE EXTERNAL TABLE `xundl_comments` (
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
LOCATION 's3://nsr-lake-613473203863/lake/xundl/2026-10-01/comments/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
