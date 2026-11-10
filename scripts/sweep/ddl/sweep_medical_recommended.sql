CREATE EXTERNAL TABLE `sweep_medical_recommended` (
  `route` string,
  `e_ev` double,
  `xs_b` double,
  `dxs_b` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/sweep/2026-11-10/medical_recommended/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
