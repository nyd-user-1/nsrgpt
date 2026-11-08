CREATE EXTERNAL TABLE `ensdf_datasets` (
  `release` string,
  `dataset_seq` int,
  `file_name` string,
  `line_no` int,
  `nucid` string,
  `a` int,
  `element` string,
  `z` int,
  `dsid` string,
  `dstype` string,
  `dsref` string,
  `publication` string,
  `date` string,
  `history` string,
  `card_count` int,
  `record_count` int,
  `level_count` int,
  `gamma_count` int
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ensdf/2026-11-05/datasets/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
