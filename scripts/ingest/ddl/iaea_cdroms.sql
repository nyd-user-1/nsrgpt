CREATE EXTERNAL TABLE `iaea_cdroms` (
  `product` string,
  `title` string,
  `issued` string,
  `year` int,
  `description` string,
  `file` string,
  `size_label` string,
  `held` boolean,
  `held_bytes` bigint,
  `held_key` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/iaea-cdroms/2026-11-07/files/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
