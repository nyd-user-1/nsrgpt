CREATE EXTERNAL TABLE `icrp107_radiations` (
  `nuclide` string,
  `seq` int,
  `code` int,
  `type` string,
  `type_name` string,
  `yield_per_transformation` double,
  `energy_mev` double,
  `is_photon` boolean
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/icrp107/2008/radiations/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
