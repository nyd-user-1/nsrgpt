CREATE EXTERNAL TABLE `sweep_medical_points` (
  `route` string,
  `source` string,
  `dataset` string,
  `e_ev` double,
  `xs_b` double,
  `dxs_b` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/medical_points/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
