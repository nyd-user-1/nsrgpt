CREATE EXTERNAL TABLE `exfor_x4pro_c5dat` (
  `datasetid` string,
  `idat` bigint,
  `yval` string,
  `y` double,
  `dy` double,
  `x1` double,
  `dx1` double,
  `x2` double,
  `dx2` double,
  `x3` double,
  `dx3` double,
  `x4` double,
  `dx4` double,
  `x5` double,
  `dx5` double,
  `dyerr` double,
  `dysys` double,
  `dystat` double,
  `dyprt` double,
  `em0` double,
  `m0` double,
  `dm0` double,
  `m1` double,
  `dm1` double,
  `fcm0` double,
  `cdat` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table x4pro_c5dat'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/x4pro_c5dat/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
