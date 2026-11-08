CREATE EXTERNAL TABLE `exfor_dict349` (
  `statflag` string,
  `authorname` string,
  `groupflag` string,
  `groupname` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table DICT349'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/DICT349/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
