CREATE EXTERNAL TABLE `exfor_x4pro_autocorr` (
  `datasetid` string,
  `ndat` bigint,
  `reatyp` string,
  `quant1` string,
  `reacode` string,
  `monitor` string,
  `montype` string,
  `fcdecaydata` double,
  `ddnucl` string,
  `ddt12` string,
  `ddt12new` string,
  `ddrad` string,
  `ddene` double,
  `ddenenew` double,
  `ddabu` double,
  `ddabunew` double,
  `fcdecaymon` double,
  `dmnucl` string,
  `dmt12` string,
  `dmt12new` string,
  `dmrad` string,
  `dmene` double,
  `dmenenew` double,
  `dmabu` double,
  `dmabunew` double,
  `autocorr` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table x4pro_autocorr'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/x4pro_autocorr/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
