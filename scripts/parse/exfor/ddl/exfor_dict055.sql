CREATE EXTERNAL TABLE `exfor_dict055` (
  `id` bigint,
  `statflag` string,
  `entryacc0` string,
  `entryacc1` string,
  `compilcenter` string,
  `responcenter` string,
  `acomment` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table DICT055'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/DICT055/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
