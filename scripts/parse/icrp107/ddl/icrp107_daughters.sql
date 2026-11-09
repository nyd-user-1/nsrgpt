CREATE EXTERNAL TABLE `icrp107_daughters` (
  `parent` string,
  `parent_z` int,
  `parent_a` int,
  `parent_isomer` string,
  `slot` int,
  `daughter` string,
  `daughter_z` int,
  `daughter_a` int,
  `daughter_isomer` string,
  `daughter_record` int,
  `daughter_stable` boolean,
  `branching_fraction` double,
  `mode` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/icrp107/2008/daughters/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
