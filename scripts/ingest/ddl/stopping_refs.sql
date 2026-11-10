CREATE EXTERNAL TABLE `stopping_refs` (
  `ref_id` string,
  `doi` string,
  `authors` string,
  `citation_reference` string,
  `year` int
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/stopping/2026-11-11/refs/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
