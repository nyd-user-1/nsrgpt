CREATE EXTERNAL TABLE IF NOT EXISTS `exfor_serve_points` (
  `dataset` string,
  `entry` string,
  `subent` string,
  `target_za` int,
  `reaction` string,
  `sf6` string,
  `source` string,
  `e_ev` double,
  `de_ev` double,
  `xs_b` double,
  `dxs_b` double,
  `units` string
)
COMMENT 'EXFOR serving table points (2026-10-28): every data point of every search_index dataset, C5 else J4 (brief 51, scripts/parse/serve/points.py)'
PARTITIONED BY (`target_z` int)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/exfor/2026-10-28/points/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
MSCK REPAIR TABLE `exfor_serve_points`;
