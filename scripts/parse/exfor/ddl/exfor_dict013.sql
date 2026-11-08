CREATE EXTERNAL TABLE `exfor_dict013` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `cindaquantity` string,
  `webquantity` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table DICT013'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/DICT013/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
