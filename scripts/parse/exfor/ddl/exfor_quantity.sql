CREATE EXTERNAL TABLE `exfor_quantity` (
  `id` bigint,
  `code` string,
  `statflag` string,
  `shorthelp` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table QUANTITY'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/QUANTITY/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
