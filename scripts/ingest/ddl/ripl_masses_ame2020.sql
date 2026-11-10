CREATE EXTERNAL TABLE `ripl_masses_ame2020` (
  `z` int,
  `a` int,
  `symbol` string,
  `flag` int,
  `mass_excess_mev` double,
  `err_mev` double
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/ripl/ripl-4-2026-05/masses_ame2020/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
