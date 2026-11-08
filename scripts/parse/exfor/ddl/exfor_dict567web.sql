CREATE EXTERNAL TABLE `exfor_dict567web` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `specialflag` string,
  `param1` string,
  `minyear` bigint,
  `maxyear` bigint,
  `minvol` bigint,
  `minpage` bigint,
  `maxpage` bigint,
  `webpagecode` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table DICT567WEB'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/DICT567WEB/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
