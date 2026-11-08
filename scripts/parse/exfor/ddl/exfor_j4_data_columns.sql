CREATE EXTERNAL TABLE `exfor_j4_data_columns` (
  `entry` string,
  `subent` string,
  `section` string,
  `col` bigint,
  `pointer` string,
  `name` string,
  `unit` string,
  `role` string,
  `axis` string,
  `in_dictionary` boolean,
  `value` double,
  `value_text` string,
  `n_rows` bigint
)
COMMENT 'J4 j4-2026-10-28 data_columns'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/j4-2026-10-28/data_columns/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
