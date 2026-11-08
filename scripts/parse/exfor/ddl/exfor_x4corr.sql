CREATE EXTERNAL TABLE `exfor_x4corr` (
  `datasetid` string,
  `author` string,
  `itype` string,
  `fileid` bigint,
  `filedate` date,
  `dbdate` date,
  `x4reac` string,
  `x4monreac` string,
  `pts` bigint,
  `enmin` double,
  `enmax` double,
  `m0lib` string,
  `monreac` string,
  `m1lib` string,
  `monfile` string,
  `link2exfor` string,
  `link2endf` string,
  `ratiogiven` bigint,
  `oldmonitorexists` bigint,
  `monitorfileexists` bigint,
  `ready4correction` bigint,
  `strcorr` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table x4corr'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/x4corr/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
