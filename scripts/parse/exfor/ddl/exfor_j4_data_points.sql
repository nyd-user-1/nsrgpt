CREATE EXTERNAL TABLE `exfor_j4_data_points` (
  `entry` string,
  `subent` string,
  `pointer` string,
  `row` int,
  `col` smallint,
  `name` string,
  `value` double,
  `value_text` string,
  `unit` string,
  `role` string,
  `axis` string
)
COMMENT 'J4 j4-2026-10-28 data_points'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/j4-2026-10-28/data_points/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
