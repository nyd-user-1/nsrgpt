CREATE EXTERNAL TABLE `exfor_x25_x4pro_expertcorr` (
  `datasetid` string,
  `author` string,
  `itype` string,
  `fileid` bigint,
  `filedate` date,
  `dbdate` date,
  `strcorr` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table x4pro_expertcorr'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/x4pro_expertcorr/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
