CREATE EXTERNAL TABLE `exfor_x25_dict053` (
  `compilid` string,
  `statflag` string,
  `compilcenter` string,
  `compilname` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT053'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT053/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
