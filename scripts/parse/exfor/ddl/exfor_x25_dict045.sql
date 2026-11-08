CREATE EXTERNAL TABLE `exfor_x25_dict045` (
  `id` bigint,
  `code` string,
  `webquantity` string,
  `statflag` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DICT045'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DICT045/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
