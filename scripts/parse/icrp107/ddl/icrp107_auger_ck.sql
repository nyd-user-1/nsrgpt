CREATE EXTERNAL TABLE `icrp107_auger_ck` (
  `nuclide` string,
  `seq` int,
  `yield_per_transformation` double,
  `energy_ev` double,
  `transition` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/icrp107/2008/auger_ck/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
