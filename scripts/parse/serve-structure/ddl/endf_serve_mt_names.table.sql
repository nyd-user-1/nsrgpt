CREATE EXTERNAL TABLE `endf_serve_mt_names` (
  `mt` int,
  `reaction` string,
  `name` string,
  `description` string
)
COMMENT 'ENDF MT numbers present in MF3, named from ENDF-102'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/endf/mt_names/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
